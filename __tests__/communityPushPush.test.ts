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

    await flushCommunityPushQueue(async () => true, "community-user");

    expect(await db.select().from(communityPushQueue)).toHaveLength(0);
  });

  it("leaves the queue row in place on a failed push", async () => {
    await saveSale("community-user", makeSale());

    await flushCommunityPushQueue(async () => false, "community-user");

    expect(await db.select().from(communityPushQueue)).toHaveLength(1);
  });

  it("processes every queued sale independently — one failure does not block another", async () => {
    await saveSale("community-user", makeSale({ id: "sale-1" }));
    await saveSale("community-user", makeSale({ id: "sale-2" }));

    const results: Record<string, boolean> = { "sale-1": false, "sale-2": true };
    await flushCommunityPushQueue(async (payload) => results[payload.saleId], "community-user");

    const remaining = (await db.select().from(communityPushQueue)).map((r) => r.saleId);
    expect(remaining).toEqual(["sale-1"]);
  });

  it("processes every queued sale independently — a rejecting invoke does not block another", async () => {
    await saveSale("community-user", makeSale({ id: "sale-1" }));
    await saveSale("community-user", makeSale({ id: "sale-2" }));

    await flushCommunityPushQueue(async (payload) => {
      if (payload.saleId === "sale-1") throw new Error("network exception");
      return true;
    }, "community-user");

    const remaining = (await db.select().from(communityPushQueue)).map((r) => r.saleId);
    expect(remaining).toEqual(["sale-1"]);
  });

  // Finding 3: signing out doesn't wipe local SQLite, so a row left behind
  // by a previous user (offline, or app killed before the flush ran) must
  // not get pushed under the next user who signs in on the same device —
  // that would pseudonymize user A's sales under user B's identity.
  it("only processes the given user's queued sales, leaving another user's row untouched", async () => {
    await db.insert(users).values({
      id: "other-user",
      subscriptionPlan: "community",
      districtId: "20",
      upazilaId: "200",
    });
    await saveSale("community-user", makeSale({ id: "sale-mine" }));
    await saveSale("other-user", makeSale({ id: "sale-other", userId: "other-user" }));
    expect(await db.select().from(communityPushQueue)).toHaveLength(2);

    const invoked: string[] = [];
    await flushCommunityPushQueue(async (payload) => {
      invoked.push(payload.saleId);
      return true;
    }, "community-user");

    expect(invoked).toEqual(["sale-mine"]);
    const remaining = (await db.select().from(communityPushQueue)).map((r) => r.saleId);
    expect(remaining).toEqual(["sale-other"]);
  });
});

describe("toDateOnly (via assembleCommunityPushPayload)", () => {
  // Finding 2: sale_date must use the device's local calendar day, not
  // UTC. Bangladesh is UTC+6, so a dawn weigh-in (normal in this trade)
  // between local midnight and 5:59am falls on the *previous* UTC day.
  // TZ is scoped to just this test (set/restored around the assertion)
  // so it can't leak into other tests in this file.
  it("stamps saleDate using local time, not UTC, for an early-morning sale", async () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "Asia/Dhaka"; // UTC+6
    try {
      // 2am local on Jan 15 2026 == 20:00 UTC on Jan 14 2026 — exactly the
      // window the old `toISOString().slice(0, 10)` implementation got wrong.
      const createdAt = new Date(2026, 0, 15, 2, 0, 0).getTime();
      await saveSale("community-user", makeSale({ createdAt }));

      const payload = await assembleCommunityPushPayload("sale-1");

      expect(payload?.saleDate).toBe("2026-01-15");
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
