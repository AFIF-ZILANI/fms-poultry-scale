// Pushes one finished community-plan sale into the analytics dataset.
// Runs server-side only — PUSH_SECRET (for pseudonymization) and the
// Postgres service role key never reach the client.
//
// The caller only needs a valid Clerk session — sign-up is free, self-serve
// Google OAuth — so this function cannot trust the request body just
// because the JWT checks out. It additionally: rejects implausible values
// (validatePayload), rate-limits pushes per farmer (checkRateLimit), and
// refuses to let one farmer's batch_id/sale_id overwrite another farmer's
// row (checkOwnership).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyClerkRequest } from "../_shared/clerkAuth.ts";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically
// to every Edge Function by the platform — no manual secret needed for
// these two. The service role key bypasses RLS, which is intentional
// here: this function is the only writer to these tables, and it has
// already verified the caller via the Clerk JWT above.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Breed = "cobb_500" | "ross_308" | "hubbard" | "sonali" | "deshi" | "other";
type BuyerType = "wholesaler" | "retail" | "direct";

interface PushPayload {
  saleId: string;
  batchId: string | null;
  saleDate: string; // "YYYY-MM-DD"
  phase: "main" | "cull";
  buyerType: BuyerType | null;
  birdsSold: number | null;
  avgWeightKg: number | null;
  totalWeightKg: number;
  pricePerKg: number;
  totalAmount: number;
  kgPerCrate: number;
  deductionPerCrateG: number;
  totalCrates: number;
  totalDeductionWtKg: number;
  hasCullPortion: boolean;
  cullWeightKg: number | null;
  cullPricePerKg: number | null;
  cullPcs: number | null;
  isPcsTracked: boolean;
  isFullCratesOnly: boolean;
  breed: Breed | null;
  placementDate: string | null; // "YYYY-MM-DD", from the batch
  initialBirdCount: number | null;
  districtId: string;
  upazilaId: string;
  farmCapacity: number | null;
}

// A farm doing dozens of distinct sales an hour is already implausible for
// this app's use case — generous enough not to block a real farm's normal
// traffic, tight enough to stop a scripted client from flooding the dataset.
const RATE_LIMIT_PUSHES_PER_HOUR = 30;

function capacityTier(farmCapacity: number | null): string | null {
  if (farmCapacity == null) return null;
  if (farmCapacity < 500) return "lt_500";
  if (farmCapacity < 2000) return "500_2000";
  if (farmCapacity < 5000) return "2000_5000";
  return "gt_5000";
}

function ageDaysAtSale(saleDate: string, placementDate: string | null): number | null {
  if (!placementDate) return null;
  const saleMs = new Date(saleDate).getTime();
  const placementMs = new Date(placementDate).getTime();
  const days = Math.round((saleMs - placementMs) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : null;
}

async function hmacFarmerId(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Rejects payloads with implausible numbers rather than trusting the client
// wholesale — this is the only line of defense between "any signed-in
// account" and what lands in the analytics dataset.
function validatePayload(body: PushPayload): string[] {
  const errors: string[] = [];
  const inRange = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n > min && n < max;

  if (!inRange(body.totalWeightKg, 0, 1_000_000)) errors.push("totalWeightKg out of range");
  if (!inRange(body.pricePerKg, 0, 100_000)) errors.push("pricePerKg out of range");
  if (!inRange(body.totalAmount, 0, 1_000_000_000)) errors.push("totalAmount out of range");
  if (body.birdsSold != null && !inRange(body.birdsSold, 0, 10_000_000)) {
    errors.push("birdsSold out of range");
  }
  if (body.avgWeightKg != null && !inRange(body.avgWeightKg, 0, 100)) {
    errors.push("avgWeightKg out of range");
  }
  if (body.initialBirdCount != null && !inRange(body.initialBirdCount, 0, 10_000_000)) {
    errors.push("initialBirdCount out of range");
  }

  const saleDateMs = Date.parse(body.saleDate);
  if (!Number.isFinite(saleDateMs)) {
    errors.push("saleDate is not a valid date");
  } else if (saleDateMs > Date.now() + 24 * 60 * 60 * 1000) {
    errors.push("saleDate is in the future");
  }

  return errors;
}

async function checkRateLimit(farmerId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("sale_event")
    .select("sale_id", { count: "exact", head: true })
    .eq("farmer_id", farmerId)
    .gte("created_at", since);
  if (error) {
    // A rate-limit check that can't run shouldn't block a real push — the
    // per-row ownership check below still guards data integrity.
    console.warn("[push-community-sale] rate limit check failed, allowing request", error);
    return true;
  }
  return (count ?? 0) < RATE_LIMIT_PUSHES_PER_HOUR;
}

// Refuses to let this request's farmer_id overwrite a row another farmer
// already owns — batch_id/sale_id are client-supplied and used as the
// upsert conflict key, so without this a caller who learns another
// farmer's id could vandalize their data.
async function checkOwnership(
  table: "batch_profile" | "sale_event",
  idColumn: "batch_id" | "sale_id",
  idValue: string,
  farmerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select("farmer_id")
    .eq(idColumn, idValue)
    .maybeSingle();
  if (error) {
    console.warn(`[push-community-sale] ownership check failed for ${table}`, error);
    return false;
  }
  return !data || data.farmer_id === farmerId;
}

Deno.serve(async (req: Request) => {
  console.log("[push-community-sale] request received");

  const auth = await verifyClerkRequest(req, "push-community-sale");
  if (!auth.ok) return auth.response;
  const clerkUserId = auth.userId;

  let body: PushPayload;
  try {
    body = await req.json();
  } catch {
    console.warn("[push-community-sale] rejected: malformed JSON body");
    return jsonResponse({ error: "Malformed JSON body" }, 400);
  }
  if (!body.saleId || !body.saleDate || !body.districtId || !body.upazilaId) {
    console.warn("[push-community-sale] rejected: missing required fields");
    return jsonResponse({ error: "Missing required fields" }, 400);
  }

  const validationErrors = validatePayload(body);
  if (validationErrors.length > 0) {
    console.warn("[push-community-sale] rejected: invalid payload", validationErrors);
    return jsonResponse({ error: "Invalid payload", details: validationErrors }, 400);
  }

  const pushSecret = Deno.env.get("PUSH_SECRET");
  if (!pushSecret) {
    console.error("[push-community-sale] PUSH_SECRET not set");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }
  const farmerId = await hmacFarmerId(clerkUserId, pushSecret);
  console.log("[push-community-sale] verified caller, farmer_id computed");

  if (!(await checkRateLimit(farmerId))) {
    console.warn("[push-community-sale] rejected: rate limit exceeded");
    return jsonResponse({ error: "Too many pushes, try again later" }, 429);
  }

  if (body.batchId && !(await checkOwnership("batch_profile", "batch_id", body.batchId, farmerId))) {
    console.warn("[push-community-sale] rejected: batch_id owned by a different farmer");
    return jsonResponse({ error: "Conflict: record owned by a different account" }, 409);
  }
  if (!(await checkOwnership("sale_event", "sale_id", body.saleId, farmerId))) {
    console.warn("[push-community-sale] rejected: sale_id owned by a different farmer");
    return jsonResponse({ error: "Conflict: record owned by a different account" }, 409);
  }

  const { error: farmError } = await supabase.from("farm_profile").upsert({
    farmer_id: farmerId,
    upazila_id: body.upazilaId,
    district_id: body.districtId,
    capacity_tier: capacityTier(body.farmCapacity),
  });
  if (farmError) {
    console.warn("[push-community-sale] farm_profile upsert failed", farmError);
    return jsonResponse({ error: "Database write failed" }, 500);
  }

  if (body.batchId) {
    const { error: batchError } = await supabase.from("batch_profile").upsert({
      batch_id: body.batchId,
      farmer_id: farmerId,
      breed: body.breed,
      initial_bird_count: body.initialBirdCount,
      placement_date: body.placementDate,
    });
    if (batchError) {
      console.warn("[push-community-sale] batch_profile upsert failed", batchError);
      return jsonResponse({ error: "Database write failed" }, 500);
    }
  }

  const { error: saleError } = await supabase.from("sale_event").upsert({
    sale_id: body.saleId,
    batch_id: body.batchId,
    farmer_id: farmerId,
    upazila_id: body.upazilaId,
    district_id: body.districtId,
    breed: body.breed,
    age_days_at_sale: ageDaysAtSale(body.saleDate, body.placementDate),
    sale_date: body.saleDate,
    phase: body.phase,
    buyer_type: body.buyerType,
    birds_sold: body.birdsSold,
    avg_weight_kg: body.avgWeightKg,
    total_weight_kg: body.totalWeightKg,
    price_per_kg: body.pricePerKg,
    total_amount: body.totalAmount,
    kg_per_crate: body.kgPerCrate,
    deduction_per_crate_g: body.deductionPerCrateG,
    total_crates: body.totalCrates,
    total_deduction_wt_kg: body.totalDeductionWtKg,
    has_cull_portion: body.hasCullPortion,
    cull_weight_kg: body.cullWeightKg,
    cull_price_per_kg: body.cullPricePerKg,
    cull_pcs: body.cullPcs,
    is_pcs_tracked: body.isPcsTracked,
    is_full_crates_only: body.isFullCratesOnly,
  });
  if (saleError) {
    console.warn("[push-community-sale] sale_event upsert failed", saleError);
    return jsonResponse({ error: "Database write failed" }, 500);
  }

  console.log(`[push-community-sale] pushed sale ${body.saleId}`);
  return jsonResponse({ ok: true }, 200);
});
