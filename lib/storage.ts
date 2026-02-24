import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SaleRecord } from "./types";

const SALES_KEY = "poultry_sales_history";

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
