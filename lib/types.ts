export interface MeasurementRow {
  id: string;
  weightKg: number;
  pcs: number;
  timestamp: number;
}

export interface SaleRecord {
  id: string;
  totalWeightKg: number;
  totalWeightGrams: number;
  totalPcs: number;
  averageWeightKg: number;
  averageWeightGrams: number;
  rows: MeasurementRow[];
  createdAt: number;
  dholta?: DholtaDetails;
}

export interface DholtaDetails {
  gross_weight: number;
  kg_per_crate: number;
  deduction_per_crate_g: number;
  full_crates_only: boolean;
  total_crates: number;
  total_deduction_kg: number;
  net_weight: number;
  price_per_kg: number;
  final_amount: number;
}
