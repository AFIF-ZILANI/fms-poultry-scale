export interface RowEditEntry {
  id: string;
  timestamp: number;
  previousWeightKg: number;
  // null = bird count was unknown at the time
  previousPcs: number | null;
  newWeightKg: number;
  newPcs: number | null;
}

export interface MeasurementRow {
  id: string;
  weightKg: number;
  // null = bird count not entered (unknown), e.g. when pcs tracking is skipped
  pcs: number | null;
  timestamp: number;
  editHistory?: RowEditEntry[];
}

export interface TradeDeduction {
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

export interface SaleRecord {
  id: string;
  totalWeightKg: number;
  totalWeightGrams: number;
  totalPcs: number;
  // false = user chose "Skip Count" — show dash instead of 0 in UI
  pcsTracked?: boolean;
  averageWeightKg: number;
  averageWeightGrams: number;
  rows: MeasurementRow[];
  cullRows?: MeasurementRow[];
  createdAt: number;
  deduction?: TradeDeduction;
  receivedAmount?: number;
  buyerName?: string;
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


export type RowGroup = {
  groupLabel: string;       // e.g. "1 – 10"
  totalWeight: number;
  totalPcs: number;
  avgWeight: number;
  data: MeasurementRow[];              // SectionList requires this key
};