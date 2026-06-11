export interface RowEditEntry {
  id: string;
  timestamp: number;
  previousWeightKg: number;
  previousPcs: number;
  newWeightKg: number;
  newPcs: number;
}

export interface MeasurementRow {
  id: string;
  weightKg: number;
  pcs: number;
  timestamp: number;
  editHistory?: RowEditEntry[];
}

export interface SaleRecord {
  id: string;
  totalWeightKg: number;
  totalWeightGrams: number;
  totalPcs: number;
  averageWeightKg: number;
  averageWeightGrams: number;
  rows: MeasurementRow[];
  cullRows?: MeasurementRow[];
  createdAt: number;
  dholta?: DholtaDetails;
  receivedAmount?: number;
  buyerName?: string;
}

export interface DholtaDetails {
  gross_weight: number;
  kg_per_crate: number;
  deduction_per_crate_g: number;
  full_crates_only: boolean;
  total_crates: number;
  total_deduction_kg: number;
  cull_weight_kg: number;
  net_weight: number;
  price_per_kg: number;
  // New fields — absent on records saved before this version
  main_amount?: number;
  cull_session_mode?: "weigh" | "pcs_only";
  cull_sold?: boolean;
  cull_pricing_mode?: "per_kg" | "per_piece";
  cull_price?: number;
  cull_pcs?: number;
  cull_amount?: number;
  final_amount: number;
}

export interface DraftSession {
  id: string;
  rows: MeasurementRow[];
  mainRows?: MeasurementRow[];
  phase?: "main" | "cull";
  pcsOptional?: boolean;
  createdAt: number;
  updatedAt: number;
  totalWeightKg: number;
  totalPcs: number;
}
