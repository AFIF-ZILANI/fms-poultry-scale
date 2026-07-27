import {
  loadSales,
  loadSale,
  loadDrafts,
  saveSale,
  deleteSale,
  getSaleStats,
  loadBatches,
  loadBatch,
  createBatch,
  renameBatch,
  setBatchClosed,
  deleteBatch,
  assignSaleToBatch,
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

// ─── Phase round-trip ─────────────────────────────────────────────────────────

// Entering cull by mistake must be reversible while cull is still empty, and
// resuming must reopen the phase that was saved rather than deriving one.
describe("main/cull phase round-trip", () => {
  const cullDraftWithNoCullRows = makeSale({
    isFinished: false,
    phase: "cull",
    hasCull: true,
    rows: [makeRow({ id: "m1", weightKg: 5 })],
    cullRows: [],
    meta: undefined,
  });

  it("reopens an empty cull phase as cull, not main", async () => {
    await saveSale("user-1", cullDraftWithNoCullRows);

    const loaded = await loadSale("sale-1");
    expect(loaded?.phase).toBe("cull");
    expect(loaded?.cullRows).toBeUndefined();
    expect(loaded?.rows.map((r) => r.id)).toEqual(["m1"]);
  });

  it("reopens a cull phase that has rows as cull", async () => {
    await saveSale(
      "user-1",
      makeSale({
        isFinished: false,
        phase: "cull",
        hasCull: true,
        rows: [makeRow({ id: "m1" })],
        cullRows: [makeRow({ id: "c1" })],
        meta: undefined,
      }),
    );

    const loaded = await loadSale("sale-1");
    expect(loaded?.phase).toBe("cull");
    expect(loaded?.cullRows?.map((r) => r.id)).toEqual(["c1"]);
  });

  it("stepping back to main restores the main rows and clears hasCull", async () => {
    await saveSale("user-1", cullDraftWithNoCullRows);
    await saveSale(
      "user-1",
      makeSale({
        isFinished: false,
        phase: "main",
        hasCull: false,
        rows: [makeRow({ id: "m1", weightKg: 5 })],
        meta: undefined,
      }),
    );

    const loaded = await loadSale("sale-1");
    expect(loaded?.phase).toBe("main");
    expect(loaded?.hasCull).toBe(false);
    expect(loaded?.rows.map((r) => r.id)).toEqual(["m1"]);
    expect(loaded?.cullRows).toBeUndefined();
  });

  it("leaves no orphaned cull rows behind after stepping back to main", async () => {
    await saveSale(
      "user-1",
      makeSale({
        isFinished: false,
        phase: "cull",
        hasCull: true,
        rows: [makeRow({ id: "m1" })],
        cullRows: [makeRow({ id: "c1" })],
        meta: undefined,
      }),
    );
    await saveSale(
      "user-1",
      makeSale({
        isFinished: false,
        phase: "main",
        hasCull: false,
        rows: [makeRow({ id: "m1" })],
        meta: undefined,
      }),
    );

    const rows = await db.query.measurementRows.findMany();
    expect(rows.map((r) => r.id)).toEqual(["m1"]);
  });

  it("still reports the draft under its saved phase", async () => {
    await saveSale("user-1", cullDraftWithNoCullRows);

    const [draft] = await loadDrafts("user-1");
    expect(draft.phase).toBe("cull");
    expect(draft.cullLog).toBe(0);
    expect(draft.mainLog).toBe(1);
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

// ─── Batches ──────────────────────────────────────────────────────────────────

describe("batches", () => {
  // finalAmount 900, receivedAmount 400 → 500 still due
  const partlyPaid = (id: string, batchId: string) =>
    makeSale({
      id,
      batchId,
      meta: makeMeta({
        finalAmount: 900,
        receivedAmount: 400,
        totalPcs: 10,
        netWeightKg: 9,
      }),
    });

  it("starts empty and reports zeroes, not nulls", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    const [batch] = await loadBatches("user-1");

    expect(batch).toMatchObject({
      id,
      name: "Shed 1",
      sessionCount: 0,
      draftCount: 0,
      birds: 0,
      weightKg: 0,
      revenue: 0,
      received: 0,
      due: 0,
    });
    expect(batch.closedAt).toBeUndefined();
  });

  it("rolls up birds, weight, revenue and due across sessions", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    await saveSale("user-1", partlyPaid("s1", id));
    await saveSale("user-1", partlyPaid("s2", id));

    const [batch] = await loadBatches("user-1");
    expect(batch).toMatchObject({
      sessionCount: 2,
      birds: 20,
      weightKg: 18,
      revenue: 1800,
      received: 800,
      due: 1000,
    });
  });

  it("counts an unfinished session but takes no money from it", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    await saveSale("user-1", partlyPaid("done", id));
    await saveSale(
      "user-1",
      makeSale({ id: "wip", batchId: id, isFinished: false, meta: undefined }),
    );

    const [batch] = await loadBatches("user-1");
    expect(batch).toMatchObject({
      sessionCount: 2,
      draftCount: 1,
      revenue: 900,
      due: 500,
    });
  });

  it("treats a fully paid session as owing nothing", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    await saveSale(
      "user-1",
      makeSale({
        id: "paid",
        batchId: id,
        meta: makeMeta({ finalAmount: 900, receivedAmount: 900 }),
      }),
    );

    expect((await loadBatches("user-1"))[0].due).toBe(0);
  });

  // An overpaid session must not quietly cancel out a real debt elsewhere.
  it("does not let an overpaid session hide another session's due", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    await saveSale(
      "user-1",
      makeSale({
        id: "over",
        batchId: id,
        meta: makeMeta({ finalAmount: 500, receivedAmount: 900 }),
      }),
    );
    await saveSale(
      "user-1",
      makeSale({
        id: "owing",
        batchId: id,
        meta: makeMeta({ finalAmount: 900, receivedAmount: 0 }),
      }),
    );

    expect((await loadBatches("user-1"))[0].due).toBe(900);
  });

  it("ignores sessions that belong to no batch", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    await saveSale("user-1", partlyPaid("in", id));
    await saveSale("user-1", makeSale({ id: "out" }));

    expect((await loadBatches("user-1"))[0].sessionCount).toBe(1);
  });

  it("hides closed batches unless asked for, keeping their totals", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    await saveSale("user-1", partlyPaid("s1", id));
    await setBatchClosed(id, true);

    expect(await loadBatches("user-1")).toEqual([]);

    const [closed] = await loadBatches("user-1", { includeClosed: true });
    expect(closed.closedAt).toEqual(expect.any(Number));
    expect(closed.revenue).toBe(900);
  });

  it("reopens a closed batch", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    await setBatchClosed(id, true);
    await setBatchClosed(id, false);

    const [batch] = await loadBatches("user-1");
    expect(batch.closedAt).toBeUndefined();
  });

  it("lists active batches before closed ones", async () => {
    const closed = "b-closed";
    await createBatch("user-1", closed, "Old");
    await setBatchClosed(closed, true);
    const active = "b-active";
    await createBatch("user-1", active, "New");

    const all = await loadBatches("user-1", { includeClosed: true });
    expect(all.map((b) => b.id)).toEqual([active, closed]);
  });

  it("isolates batches by user", async () => {
    await createBatch("user-1", "b1", "Mine");
    expect(await loadBatches("user-2")).toEqual([]);
  });

  it("renames a batch", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Typo");
    await renameBatch(id, "  Shed 2  ");
    expect((await loadBatches("user-1"))[0].name).toBe("Shed 2");
  });

  describe("loadBatch", () => {
    it("returns the batch with its sessions, newest first", async () => {
      const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
      // Distinct row ids: measurement_rows.id is a global PK, and in the app
      // every row id is a fresh UUID.
      await saveSale(
        "user-1",
        makeSale({
          id: "older",
          batchId: id,
          createdAt: 1_000,
          rows: [makeRow({ id: "r-old" })],
        }),
      );
      await saveSale(
        "user-1",
        makeSale({
          id: "newer",
          batchId: id,
          createdAt: 2_000,
          rows: [makeRow({ id: "r-new" })],
        }),
      );

      const loaded = await loadBatch(id);
      expect(loaded?.batch.name).toBe("Shed 1");
      expect(loaded?.sales.map((s) => s.id)).toEqual(["newer", "older"]);
      expect(loaded?.sales[0].rows).toHaveLength(1);
    });

    it("returns null for an unknown batch", async () => {
      expect(await loadBatch("nope")).toBeNull();
    });
  });

  describe("assignment", () => {
    it("moves a standalone sale into a batch", async () => {
      const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
      await saveSale("user-1", makeSale({ id: "s1" }));
      await assignSaleToBatch("s1", id);

      expect((await loadSale("s1"))?.batchId).toBe(id);
      expect((await loadBatches("user-1"))[0].sessionCount).toBe(1);
    });

    it("moves a sale between batches", async () => {
      const a = "b-a";
    await createBatch("user-1", a, "A");
      const b = "b-b";
    await createBatch("user-1", b, "B");
      await saveSale("user-1", partlyPaid("s1", a));
      await assignSaleToBatch("s1", b);

      const all = await loadBatches("user-1");
      expect(all.find((x) => x.id === a)?.sessionCount).toBe(0);
      expect(all.find((x) => x.id === b)?.sessionCount).toBe(1);
    });

    it("removes a sale from its batch without deleting it", async () => {
      const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
      await saveSale("user-1", partlyPaid("s1", id));
      await assignSaleToBatch("s1", null);

      expect((await loadSale("s1"))?.batchId).toBeUndefined();
      expect((await loadBatches("user-1"))[0].sessionCount).toBe(0);
    });

    it("keeps the batch across draft autosaves", async () => {
      const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
      const draft = makeSale({ id: "wip", batchId: id, isFinished: false, meta: undefined });
      await saveSale("user-1", draft);
      await saveSale("user-1", { ...draft, updatedAt: 2_000 });

      expect((await loadSale("wip"))?.batchId).toBe(id);
    });
  });

  // The whole point of ON DELETE SET NULL — a farmer's sales are never
  // collateral damage from tidying up batches.
  describe("deleteBatch", () => {
    it("keeps the sessions and turns them back into standalone sales", async () => {
      const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
      await saveSale("user-1", partlyPaid("s1", id));
      await saveSale("user-1", partlyPaid("s2", id));

      await deleteBatch(id);

      expect(await loadBatches("user-1", { includeClosed: true })).toEqual([]);
      const remaining = await loadSales("user-1");
      expect(remaining.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
      expect(remaining.every((s) => s.batchId === undefined)).toBe(true);
    });

    it("keeps the sessions' rows and money intact", async () => {
      const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
      await saveSale("user-1", partlyPaid("s1", id));
      await deleteBatch(id);

      const sale = await loadSale("s1");
      expect(sale?.rows).toHaveLength(1);
      expect(sale?.meta?.finalAmount).toBe(900);
      expect(await getSaleStats("user-1")).toEqual({
        totalSales: 1,
        totalRevenue: 900,
      });
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
