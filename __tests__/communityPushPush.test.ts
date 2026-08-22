import { db } from "../db/client";
import { users, batches, communityPushQueue } from "../db/schema";
import { saveSale } from "../lib/storage";
import { assembleCommunityPushPayload, flushCommunityPushQueue } from "../lib/communityPush/push";
import type { MeasurementRow, SaleMetaData, SaleRecord } from "../lib/types";
import { applyMigrations, resetDb } from "./helpers/db";
import { eq } from "drizzle-orm";

beforeAll(() => applyMigrations());

beforeEach(async () => {
  resetDb();
  await db.insert(users).values({
    id: "community-user",
    subscriptionPlan: "community",
    districtId: "10",
    upazilaId: "100",
    farmCapacity: 1500,
  });
});

function makeRow(o: Partial<MeasurementRow> = {}): MeasurementRow {
  return { id: "r1", weightKg: 2, pcs: 4, timestamp: 1_000, ...o };
}

function makeMeta(o: Partial<SaleMetaData> = {}): SaleMetaData {
  return {
    mainWeightKg: 10,
    mainPcs: 5,
    avgWtGrams: 2000,
    kgPerCrate: 2,
    deductionPerCrateG: 200,
    isFullCratesOnly: false,
    mainPrice: 100,
    mainAmount: 900,
    cullWeightKg: 0,
    finalAmount: 900,
    receivedAmount: 900,
    totalDeductionWtKg: 1,
    netWeightKg: 9,
    totalCrates: 5,
    totalPcs: 5,
    buyerType: "wholesaler",
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

describe("assembleCommunityPushPayload", () => {
  it("assembles a standalone sale's payload with batch fields null", async () => {
    await saveSale("community-user", makeSale());

    const payload = await assembleCommunityPushPayload("sale-1");
    expect(payload).toMatchObject({
      saleId: "sale-1",
      batchId: null,
      phase: "main",
      buyerType: "wholesaler",
      districtId: "10",
      upazilaId: "100",
      farmCapacity: 1500,
      breed: null,
      placementDate: null,
      initialBirdCount: null,
      isPcsTracked: true,
      isFullCratesOnly: false,
      totalWeightKg: 9,
      pricePerKg: 100,
      totalAmount: 900,
    });
  });

  it("assembles a batched sale's payload with the batch's breed/placementDate/initialBirdCount", async () => {
    await db.insert(batches).values({
      id: "batch-1",
      userId: "community-user",
      name: "Shed 1",
      breed: "sonali",
      placementDate: new Date("2026-01-01T00:00:00Z"),
      initialBirdCount: 500,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await saveSale("community-user", makeSale({ batchId: "batch-1" }));

    const payload = await assembleCommunityPushPayload("sale-1");
    expect(payload).toMatchObject({
      batchId: "batch-1",
      breed: "sonali",
      placementDate: "2026-01-01",
      initialBirdCount: 500,
    });
  });

  it("nulls birdsSold and avgWeightKg for a weight-only (non-pcs-tracked) sale", async () => {
    await saveSale(
      "community-user",
      makeSale({
        isPcsTracked: false,
        meta: makeMeta({ mainPcs: undefined, avgWtGrams: undefined, totalPcs: undefined }),
      }),
    );

    const payload = await assembleCommunityPushPayload("sale-1");
    expect(payload?.birdsSold).toBeNull();
    expect(payload?.avgWeightKg).toBeNull();
  });

  it("returns null for a sale that no longer exists", async () => {
    expect(await assembleCommunityPushPayload("nope")).toBeNull();
  });
});

describe("flushCommunityPushQueue", () => {
  it("clears the queue row on a successful push", async () => {
    await saveSale("community-user", makeSale());
    expect(await db.select().from(communityPushQueue)).toHaveLength(1);

    await flushCommunityPushQueue(async () => true);

    expect(await db.select().from(communityPushQueue)).toHaveLength(0);
  });

  it("leaves the queue row in place on a failed push", async () => {
    await saveSale("community-user", makeSale());

    await flushCommunityPushQueue(async () => false);

    expect(await db.select().from(communityPushQueue)).toHaveLength(1);
  });

  it("processes every queued sale independently — one failure does not block another", async () => {
    await saveSale("community-user", makeSale({ id: "sale-1" }));
    await saveSale("community-user", makeSale({ id: "sale-2" }));

    const results: Record<string, boolean> = { "sale-1": false, "sale-2": true };
    await flushCommunityPushQueue(async (payload) => results[payload.saleId]);

    const remaining = (await db.select().from(communityPushQueue)).map((r) => r.saleId);
    expect(remaining).toEqual(["sale-1"]);
  });
});
