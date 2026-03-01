import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MeasurementRow, SaleRecord } from "./types";

const SALES_KEY = "poultry_sales_history";
const LAST_PRICE_KEY = "poultry_last_price_per_kg";
const LAST_KG_PER_CRATE_KEY = "poultry_last_kg_per_crate";
const LAST_DEDUCTION_G_KEY = "poultry_last_deduction_per_crate_g";

export async function loadSales(): Promise<SaleRecord[]> {
  const data = await AsyncStorage.getItem(SALES_KEY);
  if (!data) return [];
  return JSON.parse(data) as SaleRecord[];
}

export async function saveSale(sale: SaleRecord): Promise<void> {
  const sales = await loadSales();
  sales.unshift(sale);
  await AsyncStorage.setItem(SALES_KEY, JSON.stringify(sales));
}

export async function deleteSale(id: string): Promise<void> {
  const sales = await loadSales();
  const filtered = sales.filter((s) => s.id !== id);
  await AsyncStorage.setItem(SALES_KEY, JSON.stringify(filtered));
}

export async function updateSale(
  saleId: string,
  updatedRows: MeasurementRow[]
): Promise<void> {
  const sales = await loadSales();
  const idx = sales.findIndex((s) => s.id === saleId);
  if (idx === -1) return;

  const sale = sales[idx];
  const totalWeightKg = updatedRows.reduce((sum, r) => sum + r.weightKg, 0);
  const totalPcs = updatedRows.reduce((sum, r) => sum + r.pcs, 0);
  const avgWeightKg = totalPcs > 0 ? totalWeightKg / totalPcs : 0;

  sales[idx] = {
    ...sale,
    rows: updatedRows,
    totalWeightKg,
    totalWeightGrams: Math.round(totalWeightKg * 1000),
    totalPcs,
    averageWeightKg: avgWeightKg,
    averageWeightGrams: Math.round(avgWeightKg * 1000),
  };

  await AsyncStorage.setItem(SALES_KEY, JSON.stringify(sales));
}

export async function loadLastPricePerKg(): Promise<string> {
  const val = await AsyncStorage.getItem(LAST_PRICE_KEY);
  return val ?? "";
}

export async function saveLastPricePerKg(price: string): Promise<void> {
  await AsyncStorage.setItem(LAST_PRICE_KEY, price);
}

export async function loadLastKgPerCrate(): Promise<string> {
  const val = await AsyncStorage.getItem(LAST_KG_PER_CRATE_KEY);
  return val ?? "";
}

export async function saveLastKgPerCrate(val: string): Promise<void> {
  await AsyncStorage.setItem(LAST_KG_PER_CRATE_KEY, val);
}

export async function loadLastDeductionG(): Promise<string> {
  const val = await AsyncStorage.getItem(LAST_DEDUCTION_G_KEY);
  return val ?? "";
}

export async function saveLastDeductionG(val: string): Promise<void> {
  await AsyncStorage.setItem(LAST_DEDUCTION_G_KEY, val);
}
