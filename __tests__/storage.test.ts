import {
  loadSales,
  saveSale,
  deleteSale,
  updateSale,
  loadDrafts,
  loadDraft,
  saveDraft,
  deleteDraft,
  loadLastPricePerKg,
  saveLastPricePerKg,
  loadLastKgPerCrate,
  saveLastKgPerCrate,
  loadLanguagePref,
  saveLanguagePref,
} from "../lib/storage";
import { getDb } from "../lib/database";
import type { SaleRecord, MeasurementRow, DraftSession, TradeDeduction } from "../lib/types";

// ─── In-memory DB ─────────────────────────────────────────────────────────────

type SaleRow   = { id: string; data: string; created_at: number; user_id: string };
type DraftRow  = { id: string; data: string; updated_at: number; user_id: string };
type PrefRow   = { key: string; value: string };

let mockSales:  SaleRow[]  = [];
let mockDrafts: DraftRow[] = [];
let mockPrefs:  PrefRow[]  = [];

function createMockDb() {
  return {
    execAsync: jest.fn(async () => {}),

    getFirstAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      const p = params as string[];
      if (/SELECT data FROM sales WHERE id/i.test(sql))
        return mockSales.find((r) => r.id === p[0]) ?? null;
      if (/SELECT data FROM drafts WHERE id/i.test(sql))
        return mockDrafts.find((r) => r.id === p[0]) ?? null;
      if (/SELECT value FROM prefs WHERE key/i.test(sql))
        return mockPrefs.find((r) => r.key === p[0]) ?? null;
      return null;
    }),

    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      const p = params as string[];
      if (/FROM sales WHERE user_id/i.test(sql))
        return mockSales
          .filter((r) => r.user_id === p[0])
          .sort((a, b) => b.created_at - a.created_at)
          .map((r) => ({ data: r.data }));
      if (/FROM drafts WHERE user_id/i.test(sql))
        return mockDrafts
          .filter((r) => r.user_id === p[0])
          .sort((a, b) => b.updated_at - a.updated_at)
          .map((r) => ({ data: r.data }));
      return [];
    }),

    runAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      const p = params as Array<string | number>;

      if (/INSERT OR REPLACE INTO sales/i.test(sql)) {
        const [id, data, created_at, user_id] = p;
        const idx = mockSales.findIndex((r) => r.id === id);
        const row: SaleRow = { id: id as string, data: data as string, created_at: created_at as number, user_id: user_id as string };
        idx >= 0 ? (mockSales[idx] = row) : mockSales.push(row);
        return;
      }
      if (/DELETE FROM sales WHERE id/i.test(sql)) {
        mockSales = mockSales.filter((r) => r.id !== p[0]);
        return;
      }
      if (/UPDATE sales SET data/i.test(sql)) {
        const [data, id] = p;
        const idx = mockSales.findIndex((r) => r.id === id);
        if (idx >= 0) mockSales[idx].data = data as string;
        return;
      }
      if (/INSERT OR REPLACE INTO drafts/i.test(sql)) {
        const [id, data, updated_at, user_id] = p;
        const idx = mockDrafts.findIndex((r) => r.id === id);
        const row: DraftRow = { id: id as string, data: data as string, updated_at: updated_at as number, user_id: user_id as string };
        idx >= 0 ? (mockDrafts[idx] = row) : mockDrafts.push(row);
        return;
      }
      if (/DELETE FROM drafts WHERE id/i.test(sql)) {
        mockDrafts = mockDrafts.filter((r) => r.id !== p[0]);
        return;
      }
      if (/INSERT OR REPLACE INTO prefs/i.test(sql)) {
        const [key, value] = p;
        const idx = mockPrefs.findIndex((r) => r.key === key);
        idx >= 0 ? (mockPrefs[idx].value = value as string) : mockPrefs.push({ key: key as string, value: value as string });
        return;
      }
    }),
  };
}

jest.mock("../lib/database", () => ({ getDb: jest.fn() }));

beforeEach(() => {
  mockSales  = [];
  mockDrafts = [];
  mockPrefs  = [];
  (getDb as jest.Mock).mockResolvedValue(createMockDb());
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSale(overrides: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: "sale-1",
    totalWeightKg: 10,
    totalWeightGrams: 10000,
    totalPcs: 20,
    averageWeightKg: 0.5,
    averageWeightGrams: 500,
    rows: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeRow(overrides: Partial<MeasurementRow> = {}): MeasurementRow {
  return { id: "r1", weightKg: 2, pcs: 4, timestamp: Date.now(), ...overrides };
}

function makeDraft(overrides: Partial<DraftSession> = {}): DraftSession {
  return {
    id: "draft-1",
    rows: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalWeightKg: 0,
    totalPcs: 0,
    ...overrides,
  };
}

// ─── Sales CRUD ───────────────────────────────────────────────────────────────

describe("saveSale + loadSales", () => {
  it("loads an empty array when no sales exist for a user", async () => {
    const sales = await loadSales("user-1");
    expect(sales).toEqual([]);
  });

  it("saves a sale and retrieves it", async () => {
    const sale = makeSale({ id: "s1" });
    await saveSale("user-1", sale);
    const result = await loadSales("user-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "s1", totalWeightKg: 10 });
  });

  it("round-trips all SaleRecord fields without data loss", async () => {
    const sale = makeSale({ id: "s2", buyerName: "Ahmed", receivedAmount: 9500 });
    await saveSale("user-1", sale);
    const [loaded] = await loadSales("user-1");
    expect(loaded.buyerName).toBe("Ahmed");
    expect(loaded.receivedAmount).toBe(9500);
  });

  it("returns sales ordered newest-first by createdAt", async () => {
    const older = makeSale({ id: "old", createdAt: 1000 });
    const newer = makeSale({ id: "new", createdAt: 2000 });
    await saveSale("user-1", older);
    await saveSale("user-1", newer);
    const [first] = await loadSales("user-1");
    expect(first.id).toBe("new");
  });

  it("isolates sales by userId — user-2 cannot see user-1 sales", async () => {
    await saveSale("user-1", makeSale({ id: "s-u1" }));
    const user2Sales = await loadSales("user-2");
    expect(user2Sales).toHaveLength(0);
  });

  it("replaces an existing sale when the same id is saved again (upsert)", async () => {
    await saveSale("user-1", makeSale({ id: "dup", totalWeightKg: 5 }));
    await saveSale("user-1", makeSale({ id: "dup", totalWeightKg: 10 }));
    const sales = await loadSales("user-1");
    expect(sales).toHaveLength(1);
    expect(sales[0].totalWeightKg).toBe(10);
  });
});

describe("deleteSale", () => {
  it("removes a sale so it no longer appears in loadSales", async () => {
    await saveSale("user-1", makeSale({ id: "to-delete" }));
    await deleteSale("to-delete");
    expect(await loadSales("user-1")).toHaveLength(0);
  });

  it("is a no-op when the sale id does not exist", async () => {
    await saveSale("user-1", makeSale({ id: "keep" }));
    await deleteSale("nonexistent");
    expect(await loadSales("user-1")).toHaveLength(1);
  });
});

// ─── dholta migration ─────────────────────────────────────────────────────────

describe("loadSales — dholta → deduction migration", () => {
  it("migrates old records that stored deduction under the 'dholta' key", async () => {
    // Simulate a record saved in the old format
    const deduction: TradeDeduction = {
      gross_weight: 10,
      kg_per_crate: 2,
      deduction_per_crate_g: 100,
      full_crates_only: false,
      total_crates: 5,
      total_deduction_kg: 0.5,
      cull_weight_kg: 0,
      net_weight: 9.5,
      price_per_kg: 200,
      final_amount: 1900,
    };
    const oldRecord = { id: "old-sale", createdAt: 1000, dholta: deduction } as any;
    mockSales.push({
      id: "old-sale",
      data: JSON.stringify(oldRecord),
      created_at: 1000,
      user_id: "user-1",
    });

    const [loaded] = await loadSales("user-1");
    expect(loaded.deduction).toEqual(deduction);
    expect((loaded as any).dholta).toBeUndefined();
  });

  it("leaves records with a proper 'deduction' key unchanged", async () => {
    const deduction: TradeDeduction = {
      gross_weight: 8,
      kg_per_crate: 2,
      deduction_per_crate_g: 200,
      full_crates_only: false,
      total_crates: 4,
      total_deduction_kg: 0.8,
      cull_weight_kg: 0,
      net_weight: 7.2,
      price_per_kg: 250,
      final_amount: 1800,
    };
    const sale = makeSale({ id: "modern", deduction });
    await saveSale("user-1", sale);
    const [loaded] = await loadSales("user-1");
    expect(loaded.deduction).toEqual(deduction);
  });
});

// ─── updateSale ───────────────────────────────────────────────────────────────

describe("updateSale — deduction recomputation", () => {
  const baseDeduction: TradeDeduction = {
    gross_weight: 10,
    kg_per_crate: 2,
    deduction_per_crate_g: 200,
    full_crates_only: false,
    total_crates: 5,
    total_deduction_kg: 1,
    cull_weight_kg: 0,
    net_weight: 9,
    price_per_kg: 100,
    final_amount: 900,
    cull_amount: 0,
  };

  it("recomputes totals and deduction when rows are updated", async () => {
    const sale = makeSale({ id: "upd-1", deduction: baseDeduction });
    await saveSale("user-1", sale);

    // New rows: 2 birds at 3 kg each = 6 kg gross
    const newRows: MeasurementRow[] = [
      makeRow({ id: "r1", weightKg: 3, pcs: 1 }),
      makeRow({ id: "r2", weightKg: 3, pcs: 1 }),
    ];
    await updateSale("upd-1", newRows);

    const [loaded] = await loadSales("user-1");
    expect(loaded.totalWeightKg).toBeCloseTo(6, 5);
    expect(loaded.totalWeightGrams).toBe(6000);
    expect(loaded.totalPcs).toBe(2);
    expect(loaded.averageWeightKg).toBeCloseTo(3, 5);
  });

  it("recomputes net_weight correctly after row update", async () => {
    const sale = makeSale({ id: "upd-2", deduction: baseDeduction });
    await saveSale("user-1", sale);

    // 6 kg gross, kg_per_crate = 2 → 3 crates, deduction = 3 * 0.2 kg = 0.6 kg
    const newRows: MeasurementRow[] = [makeRow({ id: "r1", weightKg: 6, pcs: 6 })];
    await updateSale("upd-2", newRows);

    const [loaded] = await loadSales("user-1");
    // net = 6 - 0.6 - 0 (cull) = 5.4
    expect(loaded.deduction?.net_weight).toBeCloseTo(5.4, 5);
    expect(loaded.deduction?.final_amount).toBeCloseTo(540, 2);
  });

  it("floors total_crates when full_crates_only is true", async () => {
    const deduction: TradeDeduction = {
      ...baseDeduction,
      full_crates_only: true,
    };
    const sale = makeSale({ id: "upd-3", deduction });
    await saveSale("user-1", sale);

    // 5 kg gross, kg_per_crate = 2 → rawCrates = 2.5 → floor = 2 (not 2.5)
    await updateSale("upd-3", [makeRow({ id: "r1", weightKg: 5, pcs: 5 })]);
    const [loaded] = await loadSales("user-1");
    expect(loaded.deduction?.total_crates).toBe(2);
    // deduction = 2 * 0.2 = 0.4 kg → net = 5 - 0.4 = 4.6
    expect(loaded.deduction?.net_weight).toBeCloseTo(4.6, 5);
  });

  it("does not use rawCrates when full_crates_only is false", async () => {
    const deduction: TradeDeduction = {
      ...baseDeduction,
      full_crates_only: false,
    };
    const sale = makeSale({ id: "upd-4", deduction });
    await saveSale("user-1", sale);

    // 5 kg gross, kg_per_crate = 2 → rawCrates = 2.5 (kept as-is)
    await updateSale("upd-4", [makeRow({ id: "r1", weightKg: 5, pcs: 5 })]);
    const [loaded] = await loadSales("user-1");
    expect(loaded.deduction?.total_crates).toBeCloseTo(2.5, 5);
  });

  it("is a no-op when the sale id does not exist", async () => {
    await updateSale("nonexistent", [makeRow()]);
    // No error thrown, no records affected
    expect(await loadSales("user-1")).toHaveLength(0);
  });

  it("preserves cull_amount in final_amount calculation", async () => {
    const deduction: TradeDeduction = {
      ...baseDeduction,
      cull_amount: 500,
    };
    const sale = makeSale({ id: "upd-5", deduction });
    await saveSale("user-1", sale);

    // 6 kg, 3 crates, deduction = 0.6 kg, net = 5.4 kg
    await updateSale("upd-5", [makeRow({ id: "r1", weightKg: 6, pcs: 6 })]);
    const [loaded] = await loadSales("user-1");
    // main_amount = 5.4 * 100 = 540, final = 540 + 500 = 1040
    expect(loaded.deduction?.final_amount).toBeCloseTo(1040, 2);
  });

  it("skips deduction recomputation when sale has no deduction", async () => {
    const sale = makeSale({ id: "upd-6", deduction: undefined });
    await saveSale("user-1", sale);

    await updateSale("upd-6", [makeRow({ id: "r1", weightKg: 4, pcs: 2 })]);
    const [loaded] = await loadSales("user-1");
    expect(loaded.deduction).toBeUndefined();
    expect(loaded.totalWeightKg).toBeCloseTo(4, 5);
  });
});

// ─── Drafts ───────────────────────────────────────────────────────────────────

describe("Draft CRUD", () => {
  it("returns empty array when no drafts exist", async () => {
    expect(await loadDrafts("user-1")).toEqual([]);
  });

  it("saves and retrieves a draft for the correct user", async () => {
    const draft = makeDraft({ id: "d1" });
    await saveDraft("user-1", draft);
    const drafts = await loadDrafts("user-1");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe("d1");
  });

  it("loadDraft returns null when draft does not exist", async () => {
    expect(await loadDraft("nope")).toBeNull();
  });

  it("loadDraft returns the draft when it exists", async () => {
    const draft = makeDraft({ id: "d2" });
    await saveDraft("user-1", draft);
    const loaded = await loadDraft("d2");
    expect(loaded?.id).toBe("d2");
  });

  it("isolates drafts by userId", async () => {
    await saveDraft("user-1", makeDraft({ id: "d-u1" }));
    expect(await loadDrafts("user-2")).toHaveLength(0);
  });

  it("returns drafts ordered newest-first by updatedAt", async () => {
    await saveDraft("user-1", makeDraft({ id: "old", updatedAt: 1000 }));
    await saveDraft("user-1", makeDraft({ id: "new", updatedAt: 2000 }));
    const [first] = await loadDrafts("user-1");
    expect(first.id).toBe("new");
  });

  it("deletes a draft so it no longer appears", async () => {
    await saveDraft("user-1", makeDraft({ id: "to-del" }));
    await deleteDraft("to-del");
    expect(await loadDrafts("user-1")).toHaveLength(0);
  });
});

// ─── Preferences ─────────────────────────────────────────────────────────────

describe("Preference storage", () => {
  it("returns empty string when pref is not set", async () => {
    expect(await loadLastPricePerKg("user-1")).toBe("");
  });

  it("saves and loads a preference value", async () => {
    await saveLastPricePerKg("user-1", "250");
    expect(await loadLastPricePerKg("user-1")).toBe("250");
  });

  it("isolates prefs by userId — same setting name returns different values per user", async () => {
    await saveLastPricePerKg("user-1", "200");
    await saveLastPricePerKg("user-2", "300");
    expect(await loadLastPricePerKg("user-1")).toBe("200");
    expect(await loadLastPricePerKg("user-2")).toBe("300");
  });

  it("overwrites a preference when saved again", async () => {
    await saveLastPricePerKg("user-1", "100");
    await saveLastPricePerKg("user-1", "150");
    expect(await loadLastPricePerKg("user-1")).toBe("150");
  });

  it("manages independent keys for different preferences", async () => {
    await saveLastKgPerCrate("user-1", "15");
    await saveLanguagePref("user-1", "bn");
    expect(await loadLastKgPerCrate("user-1")).toBe("15");
    expect(await loadLanguagePref("user-1")).toBe("bn");
  });
});
