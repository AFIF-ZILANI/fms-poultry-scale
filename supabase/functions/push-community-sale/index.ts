// Pushes one finished community-plan sale into the analytics dataset.
// Runs server-side only — PUSH_SECRET (for pseudonymization) and the
// Postgres service role key never reach the client.
//
// The Clerk-JWT-verification block below is deliberately duplicated from
// supabase/functions/drive-token/index.ts rather than factored into a
// shared module: each Edge Function deploys and cold-starts
// independently, this is the only other place that needs it, and the two
// call sites' verification logic is unlikely to diverge — see that
// file's own comments for the full rationale behind verifying against
// Clerk's JWKS directly instead of Supabase's /auth/v1/user.

import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CLERK_PUBLISHABLE_KEY = "pk_test_dW5pcXVlLW1hcm1vc2V0LTEwLmNsZXJrLmFjY291bnRzLmRldiQ";

function clerkJwksUrl(publishableKey: string): string {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  const domain = atob(encoded).replace(/\$$/, "");
  return `https://${domain}/.well-known/jwks.json`;
}

const clerkJwks = createRemoteJWKSet(new URL(clerkJwksUrl(CLERK_PUBLISHABLE_KEY)));

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

Deno.serve(async (req: Request) => {
  console.log("[push-community-sale] request received");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("[push-community-sale] rejected: missing or malformed Authorization header");
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }
  const sessionToken = authHeader.slice("Bearer ".length);

  let clerkUserId: string;
  try {
    const { payload } = await jwtVerify(sessionToken, clerkJwks);
    if (typeof payload.sub !== "string") {
      throw new Error("token has no sub claim");
    }
    clerkUserId = payload.sub;
  } catch (err) {
    console.warn("[push-community-sale] rejected: Clerk JWT verification failed", err);
    return jsonResponse({ error: "Invalid session" }, 401);
  }

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

  const pushSecret = Deno.env.get("PUSH_SECRET")!;
  const farmerId = await hmacFarmerId(clerkUserId, pushSecret);
  console.log("[push-community-sale] verified caller, farmer_id computed");

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
