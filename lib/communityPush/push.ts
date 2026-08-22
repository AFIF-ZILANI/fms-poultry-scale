import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sales, saleMetaData, batches, users, communityPushQueue } from "@/db/schema";

export interface CommunityPushPayload {
  saleId: string;
  batchId: string | null;
  saleDate: string; // "YYYY-MM-DD"
  phase: "main" | "cull";
  buyerType: "wholesaler" | "retail" | "direct" | null;
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
  breed: "cobb_500" | "ross_308" | "hubbard" | "sonali" | "deshi" | "other" | null;
  placementDate: string | null;
  initialBirdCount: number | null;
  districtId: string;
  upazilaId: string;
  farmCapacity: number | null;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Reads everything a single queued sale needs, joined from the sale, its
// meta, its batch (if any), and the owning user's location/capacity.
// Returns null if the sale (or its meta) no longer exists — a queue row
// referencing a deleted sale is caught by the FK's ON DELETE CASCADE
// before this ever runs, but a defensive null keeps this function total.
export async function assembleCommunityPushPayload(
  saleId: string,
): Promise<CommunityPushPayload | null> {
  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  if (!sale) return null;
  const meta = await db.select().from(saleMetaData).where(eq(saleMetaData.saleId, saleId)).get();
  if (!meta) return null;
  const user = await db.select().from(users).where(eq(users.id, sale.userId)).get();
  if (!user || !user.districtId || !user.upazilaId) return null;
  const batch = sale.batchId
    ? await db.select().from(batches).where(eq(batches.id, sale.batchId)).get()
    : null;

  return {
    saleId: sale.id,
    batchId: sale.batchId ?? null,
    saleDate: toDateOnly(sale.createdAt),
    phase: sale.phase,
    buyerType: meta.buyerType ?? null,
    birdsSold: meta.totalPcs ?? null,
    avgWeightKg: meta.avgWtGrams != null ? meta.avgWtGrams / 1000 : null,
    totalWeightKg: meta.netWeightKg,
    pricePerKg: meta.mainPrice,
    totalAmount: meta.finalAmount,
    kgPerCrate: meta.kgPerCrate,
    deductionPerCrateG: meta.deductionPerCrateG,
    totalCrates: meta.totalCrates,
    totalDeductionWtKg: meta.totalDeductionWtKg,
    hasCullPortion: sale.hasCull,
    cullWeightKg: meta.cullWeightKg ?? null,
    cullPricePerKg: meta.cullPrice ?? null,
    cullPcs: meta.cullPcs ?? null,
    isPcsTracked: sale.isPcsTracked,
    isFullCratesOnly: meta.isFullCratesOnly,
    breed: batch?.breed ?? null,
    placementDate: batch?.placementDate ? toDateOnly(batch.placementDate) : null,
    initialBirdCount: batch?.initialBirdCount ?? null,
    districtId: user.districtId,
    upazilaId: user.upazilaId,
    farmCapacity: user.farmCapacity ?? null,
  };
}

// Drains the whole queue. `invoke` does the actual network call (injected
// so this stays testable without mocking fetch/supabase here — the real
// invoke lives in schedule.ts) and returns whether the push succeeded.
// Each queued sale is processed independently: one failure leaves that
// row for the next flush without blocking the rest of the queue.
export async function flushCommunityPushQueue(
  invoke: (payload: CommunityPushPayload) => Promise<boolean>,
): Promise<void> {
  const queued = await db.select().from(communityPushQueue);
  for (const row of queued) {
    const payload = await assembleCommunityPushPayload(row.saleId);
    if (!payload) {
      // Nothing sensible to push (e.g. the sale's user lost its location
      // somehow) — drop the row rather than retry forever.
      await db.delete(communityPushQueue).where(eq(communityPushQueue.saleId, row.saleId));
      continue;
    }
    // A rejecting `invoke` (e.g. a network exception) must not abort the
    // rest of the queue — treat it the same as a `false` result.
    let succeeded: boolean;
    try {
      succeeded = await invoke(payload);
    } catch {
      succeeded = false;
    }
    if (succeeded) {
      await db.delete(communityPushQueue).where(eq(communityPushQueue.saleId, row.saleId));
    }
  }
}
