import { db } from "../db/client";
import { users, batches, communityPushQueue } from "../db/schema";
import { saveSale } from "../lib/storage";
import type { MeasurementRow, SaleMetaData, SaleRecord } from "../lib/types";
import { applyMigrations, resetDb } from "./helpers/db";
import { eq } from "drizzle-orm";

beforeAll(() => applyMigrations());

beforeEach(async () => {
  resetDb();
  await db.insert(users).values([
    { id: "community-user", subscriptionPlan: "community" },
    { id: "premium-user", subscriptionPlan: "premium" },
  ]);
});

function makeRow(o: Partial<MeasurementRow> = {}): MeasurementRow {
  return { id: "r1", weightKg: 2, pcs: 4, timestamp: 1_000, ...o };
}

function makeMeta(o: Partial<SaleMetaData> = {}): SaleMetaData {
  return {
    mainWeightKg: 10,
    kgPerCrate: 2,
    deductionPerCrateG: 200,
    isFullCratesOnly: false,
    mainPrice: 100,
    mainAmount: 900,
    cullWeightKg: 0,
    finalAmount: 900,
    receivedAmount: 0,
    totalDeductionWtKg: 1,
    netWeightKg: 9,
    totalCrates: 5,
    createdAt: 1_000,
    ...o,
  };
}

function makeSale(o: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: "sale-1",
    userId: "community-user",
    phase: "main",
    isPcsTracked: true,
    hasCull: false,
    isFinished: true,
    rows: [makeRow()],
    createdAt: 1_000,
    updatedAt: 1_000,
    meta: makeMeta(),
    ...o,
  };
}

async function queuedSaleIds(): Promise<string[]> {
  const rows = await db.select().from(communityPushQueue);
  return rows.map((r) => r.saleId);
}

describe("community push queue", () => {
  it("queues a finished sale for a community-plan user", async () => {
    await saveSale("community-user", makeSale());
    expect(await queuedSaleIds()).toEqual(["sale-1"]);
  });

  it("does not queue a finished sale for a premium-plan user", async () => {
    await saveSale("premium-user", makeSale({ userId: "premium-user" }));
    expect(await queuedSaleIds()).toEqual([]);
  });

  it("does not queue an unfinished (draft) sale", async () => {
    await saveSale("community-user", makeSale({ isFinished: false, meta: undefined }));
    expect(await queuedSaleIds()).toEqual([]);
  });

  it("re-queues an already-pushed sale when it is edited again", async () => {
    await saveSale("community-user", makeSale());
    // Simulate the flush having already cleared it:
    await db.delete(communityPushQueue).where(eq(communityPushQueue.saleId, "sale-1"));
    expect(await queuedSaleIds()).toEqual([]);

    await saveSale("community-user", makeSale({ meta: makeMeta({ finalAmount: 950 }) }));
    expect(await queuedSaleIds()).toEqual(["sale-1"]);
  });

  it("keeps a queued sale queued after the user switches to premium", async () => {
    await saveSale("community-user", makeSale());
    expect(await queuedSaleIds()).toEqual(["sale-1"]);

    await db.update(users).set({ subscriptionPlan: "premium" }).where(eq(users.id, "community-user"));

    // The row is still there — nothing removes an already-queued sale on
    // a plan switch, matching spec §5's "no retroactive removal" rule.
    expect(await queuedSaleIds()).toEqual(["sale-1"]);
  });

  it("queues a finished sale for a community-plan user even when it belongs to a batch", async () => {
    await db.insert(batches).values({
      id: "batch-1",
      userId: "community-user",
      name: "Shed 1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await saveSale("community-user", makeSale({ batchId: "batch-1" }));
    expect(await queuedSaleIds()).toEqual(["sale-1"]);
  });
});
