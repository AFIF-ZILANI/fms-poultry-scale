import { getDb } from "./database";
import type { MeasurementRow, SaleRecord, DraftSession } from "./types";

// ─── Sales ────────────────────────────────────────────────────────────────────

export async function loadSales(userId: string): Promise<SaleRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(
    "SELECT data FROM sales WHERE user_id = ? ORDER BY created_at DESC",
    [userId]
  );
  return rows.map((r) => {
    const parsed = JSON.parse(r.data) as SaleRecord & { dholta?: SaleRecord["deduction"] };
    // Migrate old records that stored trade deduction under the "dholta" key
    if (!parsed.deduction && parsed.dholta) {
      parsed.deduction = parsed.dholta;
      delete (parsed as unknown as Record<string, unknown>).dholta;
    }
    return parsed as SaleRecord;
  });
}

export async function saveSale(userId: string, sale: SaleRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO sales (id, data, created_at, user_id) VALUES (?, ?, ?, ?)",
    [sale.id, JSON.stringify(sale), sale.createdAt, userId]
  );
}

export async function deleteSale(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM sales WHERE id = ?", [id]);
}

export async function updateSale(
  saleId: string,
  updatedRows: MeasurementRow[]
): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string }>(
    "SELECT data FROM sales WHERE id = ?",
    [saleId]
  );
  if (!row) return;

  const sale: SaleRecord = JSON.parse(row.data);
  const totalWeightKg = updatedRows.reduce((s, r) => s + r.weightKg, 0);
  const totalPcs = updatedRows.reduce((s, r) => s + (r.pcs ?? 0), 0);
  const avgWeightKg = totalPcs > 0 ? totalWeightKg / totalPcs : 0;

  // Recompute trade deduction with updated gross weight
  let updatedDeduction = sale.deduction;
  if (updatedDeduction) {
    const d = updatedDeduction;
    const rawCrates = totalWeightKg / d.kg_per_crate;
    const totalCrates = d.full_crates_only ? Math.floor(rawCrates) : rawCrates;
    const totalDeductionKg = (totalCrates * d.deduction_per_crate_g) / 1000;
    const netWeight = Math.max(0, totalWeightKg - totalDeductionKg - d.cull_weight_kg);
    const mainAmount = netWeight * d.price_per_kg;
    const finalAmount = mainAmount + (d.cull_amount ?? 0);
    updatedDeduction = {
      ...d,
      gross_weight: totalWeightKg,
      total_crates: totalCrates,
      total_deduction_kg: totalDeductionKg,
      net_weight: netWeight,
      main_amount: mainAmount,
      final_amount: finalAmount,
    };
  }

  const updated: SaleRecord = {
    ...sale,
    rows: updatedRows,
    totalWeightKg,
    totalWeightGrams: Math.round(totalWeightKg * 1000),
    totalPcs,
    averageWeightKg: avgWeightKg,
    averageWeightGrams: Math.round(avgWeightKg * 1000),
    deduction: updatedDeduction,
  };

  await db.runAsync("UPDATE sales SET data = ? WHERE id = ?", [
    JSON.stringify(updated),
    saleId,
  ]);
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export async function loadDrafts(userId: string): Promise<DraftSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(
    "SELECT data FROM drafts WHERE user_id = ? ORDER BY updated_at DESC",
    [userId]
  );
  return rows.map((r) => JSON.parse(r.data) as DraftSession);
}

export async function loadDraft(id: string): Promise<DraftSession | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string }>(
    "SELECT data FROM drafts WHERE id = ?",
    [id]
  );
  return row ? (JSON.parse(row.data) as DraftSession) : null;
}

export async function saveDraft(userId: string, draft: DraftSession): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO drafts (id, data, updated_at, user_id) VALUES (?, ?, ?, ?)",
    [draft.id, JSON.stringify(draft), draft.updatedAt, userId]
  );
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM drafts WHERE id = ?", [id]);
}

// ─── Preferences ──────────────────────────────────────────────────────────────

async function getPref(key: string): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM prefs WHERE key = ?",
    [key]
  );
  return row?.value ?? "";
}

async function setPref(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)",
    [key, value]
  );
}

// All pref keys are namespaced by userId so each account has its own settings.
// key format: "${userId}:${settingName}"
const uk = (userId: string, name: string) => `${userId}:${name}`;

// ─── Preferences Chunk size ───────────────────────────────────────────────────

const CHUNK_SIZE_KEY = "chunkSize";
export const DEFAULT_CHUNK_SIZE = 10;

export async function getChunkSize(userId: string): Promise<number> {
  const val = await getPref(uk(userId, CHUNK_SIZE_KEY));
  return val ? parseInt(val, 10) : DEFAULT_CHUNK_SIZE;
}

export async function setChunkSize(userId: string, size: number): Promise<void> {
  await setPref(uk(userId, CHUNK_SIZE_KEY), size.toString());
}


export const loadLastPricePerKg = (uid: string) => getPref(uk(uid, "last_price_per_kg"));
export const saveLastPricePerKg = (uid: string, v: string) => setPref(uk(uid, "last_price_per_kg"), v);

export const loadLastKgPerCrate = (uid: string) => getPref(uk(uid, "last_kg_per_crate"));
export const saveLastKgPerCrate = (uid: string, v: string) => setPref(uk(uid, "last_kg_per_crate"), v);

export const loadLastDeductionG = (uid: string) => getPref(uk(uid, "last_deduction_g"));
export const saveLastDeductionG = (uid: string, v: string) => setPref(uk(uid, "last_deduction_g"), v);

export const loadLanguagePref = (uid: string) => getPref(uk(uid, "language"));
export const saveLanguagePref = (uid: string, v: string) => setPref(uk(uid, "language"), v);

export const loadThemePref = (uid: string) => getPref(uk(uid, "theme_preference"));
export const saveThemePref = (uid: string, v: string) => setPref(uk(uid, "theme_preference"), v);

export const loadFarmName = (uid: string) => getPref(uk(uid, "farm_name"));
export const saveFarmName = (uid: string, v: string) => setPref(uk(uid, "farm_name"), v);

export const loadSubscriptionPlan = (uid: string) => getPref(uk(uid, "subscription_plan"));
export const saveSubscriptionPlan = (uid: string, v: string) => setPref(uk(uid, "subscription_plan"), v);
