import {
  loadSales,
  loadSale,
  loadDrafts,
  saveSale,
  deleteSale,
  getSaleStats,
  getUserPrefs,
  saveUserPrefs,
  loadLastPricePerKg,
  saveLastPricePerKg,
} from "../lib/storage";
import { db } from "../db/client";
import { users } from "../db/schema";
import type { MeasurementRow, SaleMetaData, SaleRecord } from "../lib/types";
import { applyMigrations, resetDb } from "./helpers/db";

beforeAll(() => applyMigrations());

beforeEach(async () => {
  resetDb();
  await db.insert(users).values([{ id: "user-1" }, { id: "user-2" }]);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    userId: "user-1",
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

// ─── Sales CRUD ───────────────────────────────────────────────────────────────

describe("saveSale + loadSales", () => {
  it("returns an empty list when the user has no sales", async () => {
    expect(await loadSales("user-1")).toEqual([]);
  });

  it("round-trips a sale with its rows and meta in one read", async () => {
    await saveSale("user-1", makeSale());
    const [loaded] = await loadSales("user-1");

    expect(loaded.id).toBe("sale-1");
    expect(loaded.rows).toHaveLength(1);
    expect(loaded.rows[0]).toMatchObject({ weightKg: 2, pcs: 4 });
    expect(loaded.meta?.finalAmount).toBe(900);
  });

  it("keeps main and cull rows in separate buckets", async () => {
    await saveSale(
      "user-1",
      makeSale({
        hasCull: true,
        rows: [makeRow({ id: "m1", weightKg: 5 })],
        cullRows: [makeRow({ id: "c1", weightKg: 1 })],
      }),
    );
    const [loaded] = await loadSales("user-1");

    expect(loaded.rows.map((r) => r.id)).toEqual(["m1"]);
    expect(loaded.cullRows?.map((r) => r.id)).toEqual(["c1"]);
  });

  it("returns rows newest-first, which is the order the log UI numbers from", async () => {
    await saveSale(
      "user-1",
      makeSale({
        rows: [
          makeRow({ id: "old", timestamp: 1_000 }),
          makeRow({ id: "new", timestamp: 3_000 }),
          makeRow({ id: "mid", timestamp: 2_000 }),
        ],
      }),
    );
    const [loaded] = await loadSales("user-1");
    expect(loaded.rows.map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });

  it("orders sales newest-first", async () => {
    await saveSale("user-1", makeSale({ id: "older", createdAt: 1_000 }));
    await saveSale("user-1", makeSale({ id: "newer", createdAt: 2_000 }));
    expect((await loadSales("user-1")).map((s) => s.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("isolates sales by user", async () => {
    await saveSale("user-1", makeSale());
    expect(await loadSales("user-2")).toEqual([]);
  });

  it("upserts rather than duplicating when the same sale is saved twice", async () => {
    await saveSale("user-1", makeSale({ meta: makeMeta({ finalAmount: 1 }) }));
    await saveSale("user-1", makeSale({ meta: makeMeta({ finalAmount: 2 }) }));

    const sales = await loadSales("user-1");
    expect(sales).toHaveLength(1);
    expect(sales[0].meta?.finalAmount).toBe(2);
  });

  it("drops rows that were removed from the sale", async () => {
    await saveSale(
      "user-1",
      makeSale({ rows: [makeRow({ id: "a" }), makeRow({ id: "b" })] }),
    );
    await saveSale("user-1", makeSale({ rows: [makeRow({ id: "a" })] }));

    const [loaded] = await loadSales("user-1");
    expect(loaded.rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("clears the meta row when a sale is saved without meta", async () => {
    await saveSale("user-1", makeSale());
    await saveSale("user-1", makeSale({ meta: undefined }));
    expect((await loadSale("sale-1"))?.meta).toBeUndefined();
  });
});

describe("loadSale", () => {
  it("returns a single sale by id", async () => {
    await saveSale("user-1", makeSale());
    expect((await loadSale("sale-1"))?.id).toBe("sale-1");
  });

  it("returns null for an unknown id", async () => {
    expect(await loadSale("nope")).toBeNull();
  });
});

describe("deleteSale", () => {
  it("removes the sale and cascades to its rows", async () => {
    await saveSale("user-1", makeSale());
    await deleteSale("sale-1");

    expect(await loadSales("user-1")).toEqual([]);
    const rows = await db.query.measurementRows.findMany();
    expect(rows).toEqual([]);
  });

  it("is a no-op for an unknown id", async () => {
    await saveSale("user-1", makeSale());
    await deleteSale("nope");
    expect(await loadSales("user-1")).toHaveLength(1);
  });
});

// ─── Edit history ─────────────────────────────────────────────────────────────

describe("row edit history", () => {
  const edit = {
    id: "h1",
    timestamp: 2_000,
    previousWeightKg: 2,
    previousPcs: 4,
    newWeightKg: 3,
    newPcs: 5,
    reason: "misread scale",
  };

  it("persists edit history and reads it back on the row", async () => {
    await saveSale(
      "user-1",
      makeSale({ rows: [makeRow({ weightKg: 3, pcs: 5, editHistory: [edit] })] }),
    );

    const [loaded] = await loadSales("user-1");
    expect(loaded.rows[0].editHistory).toEqual([edit]);
  });

  // Regression: rows used to be deleted and re-inserted on every save, and the
  // ON DELETE CASCADE took the audit trail with them.
  it("survives a later save that does not carry the history", async () => {
    await saveSale(
      "user-1",
      makeSale({ rows: [makeRow({ weightKg: 3, pcs: 5, editHistory: [edit] })] }),
    );
    await saveSale(
      "user-1",
      makeSale({ rows: [makeRow({ weightKg: 3, pcs: 5 })] }),
    );

    const [loaded] = await loadSales("user-1");
    expect(loaded.rows[0].editHistory).toEqual([edit]);
  });

  it("does not duplicate an entry that is saved twice", async () => {
    const sale = makeSale({
      rows: [makeRow({ weightKg: 3, pcs: 5, editHistory: [edit] })],
    });
    await saveSale("user-1", sale);
    await saveSale("user-1", sale);

    const [loaded] = await loadSales("user-1");
    expect(loaded.rows[0].editHistory).toHaveLength(1);
  });

  it("returns newest edits first", async () => {
    await saveSale(
      "user-1",
      makeSale({
        rows: [
          makeRow({
            editHistory: [
              { ...edit, id: "h2", timestamp: 5_000 },
              { ...edit, id: "h1", timestamp: 2_000 },
            ],
          }),
        ],
      }),
    );

    const [loaded] = await loadSales("user-1");
    expect(loaded.rows[0].editHistory?.map((h) => h.id)).toEqual(["h2", "h1"]);
  });

  it("goes away with the sale it belongs to", async () => {
    await saveSale(
      "user-1",
      makeSale({ rows: [makeRow({ editHistory: [edit] })] }),
    );
    await deleteSale("sale-1");
    expect(await db.query.rowEditHistory.findMany()).toEqual([]);
  });
});

// ─── Drafts + stats ───────────────────────────────────────────────────────────

describe("loadDrafts", () => {
  it("only lists unfinished sales", async () => {
    await saveSale("user-1", makeSale({ id: "done", isFinished: true }));
    await saveSale("user-1", makeSale({ id: "wip", isFinished: false }));

    const drafts = await loadDrafts("user-1");
    expect(drafts.map((d) => d.id)).toEqual(["wip"]);
  });

  it("aggregates row counts and weights per phase", async () => {
    await saveSale(
      "user-1",
      makeSale({
        id: "wip",
        isFinished: false,
        hasCull: true,
        rows: [
          makeRow({ id: "m1", weightKg: 3, pcs: 2 }),
          makeRow({ id: "m2", weightKg: 4, pcs: 3 }),
        ],
        cullRows: [makeRow({ id: "c1", weightKg: 1, pcs: 1 })],
      }),
    );

    const [d] = await loadDrafts("user-1");
    expect(d).toMatchObject({
      mainLog: 2,
      cullLog: 1,
      mainBirdCount: 5,
      cullBirdCount: 1,
      mainWeightKg: 7,
      cullWeightKg: 1,
    });
  });

  it("isolates drafts by user", async () => {
    await saveSale("user-1", makeSale({ isFinished: false }));
    expect(await loadDrafts("user-2")).toEqual([]);
  });
});

describe("getSaleStats", () => {
  it("counts sales and sums revenue in one query", async () => {
    await saveSale(
      "user-1",
      makeSale({ id: "s1", meta: makeMeta({ finalAmount: 900 }) }),
    );
    await saveSale(
      "user-1",
      makeSale({ id: "s2", meta: makeMeta({ finalAmount: 100 }) }),
    );

    expect(await getSaleStats("user-1")).toEqual({
      totalSales: 2,
      totalRevenue: 1000,
    });
  });

  it("reports zeroes for a user with no sales", async () => {
    expect(await getSaleStats("user-2")).toEqual({
      totalSales: 0,
      totalRevenue: 0,
    });
  });

  it("counts sales that have no meta row", async () => {
    await saveSale("user-1", makeSale({ meta: undefined }));
    expect(await getSaleStats("user-1")).toEqual({
      totalSales: 1,
      totalRevenue: 0,
    });
  });
});

// ─── Prefs ────────────────────────────────────────────────────────────────────

describe("user prefs", () => {
  it("returns defaults for a user who has never saved prefs", async () => {
    expect(await getUserPrefs("user-1")).toMatchObject({
      language: "en",
      theme: "system",
      logGroupSize: 10,
      priceKg: 0,
    });
  });

  it("saves a partial patch without clobbering the other fields", async () => {
    await saveUserPrefs("user-1", { priceKg: 250, language: "bn" });
    await saveUserPrefs("user-1", { theme: "dark" });

    const prefs = await getUserPrefs("user-1");
    expect(prefs).toMatchObject({ priceKg: 250, language: "bn", theme: "dark" });
  });

  // An empty patch used to emit `DO UPDATE SET` with no assignments.
  it("tolerates an empty patch", async () => {
    await saveUserPrefs("user-1", { priceKg: 42 });
    await expect(saveUserPrefs("user-1", {})).resolves.toBeUndefined();
    expect((await getUserPrefs("user-1")).priceKg).toBe(42);
  });

  it("isolates prefs by user", async () => {
    await saveLastPricePerKg("user-1", 200);
    await saveLastPricePerKg("user-2", 300);

    expect(await loadLastPricePerKg("user-1")).toBe(200);
    expect(await loadLastPricePerKg("user-2")).toBe(300);
  });
});
