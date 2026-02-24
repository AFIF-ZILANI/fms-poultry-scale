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
}
