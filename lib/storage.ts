import { getDb } from "./database";
import type { MeasurementRow, SaleRecord } from "./types";

export async function loadSales(): Promise<SaleRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(
    "SELECT data FROM sales ORDER BY created_at DESC"
  );
  return rows.map((r) => JSON.parse(r.data) as SaleRecord);
}

export async function saveSale(sale: SaleRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO sales (id, data, created_at) VALUES (?, ?, ?)",
    [sale.id, JSON.stringify(sale), sale.createdAt]
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
  const totalPcs = updatedRows.reduce((s, r) => s + r.pcs, 0);
  const avgWeightKg = totalPcs > 0 ? totalWeightKg / totalPcs : 0;

  const updated: SaleRecord = {
    ...sale,
    rows: updatedRows,
    totalWeightKg,
    totalWeightGrams: Math.round(totalWeightKg * 1000),
    totalPcs,
    averageWeightKg: avgWeightKg,
    averageWeightGrams: Math.round(avgWeightKg * 1000),
  };

  await db.runAsync("UPDATE sales SET data = ? WHERE id = ?", [
    JSON.stringify(updated),
    saleId,
  ]);
}

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

export const loadLastPricePerKg = () => getPref("last_price_per_kg");
export const saveLastPricePerKg = (v: string) =>
  setPref("last_price_per_kg", v);

export const loadLastKgPerCrate = () => getPref("last_kg_per_crate");
export const saveLastKgPerCrate = (v: string) =>
  setPref("last_kg_per_crate", v);

export const loadLastDeductionG = () => getPref("last_deduction_g");
export const saveLastDeductionG = (v: string) =>
  setPref("last_deduction_g", v);
