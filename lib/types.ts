type Phase = "main" | "cull";

export interface RowEditEntry {
  id: string;
  timestamp: number;
  previousWeightKg: number;
  previousPcs: number | null;
  newWeightKg: number;
  newPcs: number | null;
  reason?: string;
}

export interface MeasurementRow {
  id: string;
  weightKg: number;
  pcs: number | null;
  timestamp: number;
  editHistory?: RowEditEntry[];
}

export interface SaleMetaData {
  mainWeightKg: number;
  mainPcs?: number;
  avgWtGrams?: number;
  buyerName?: string;
  kgPerCrate: number;
  deductionPerCrateG: number;
  isFullCratesOnly: boolean;
  mainPrice: number;
  mainAmount: number;
  cullWeightKg: number;
  isCullSold?: boolean;
  cullSaleType?: "pcs" | "weight";
  cullPrice?: number;
  cullPcs?: number;
  cullAmount?: number;
  finalAmount: number;
  receivedAmount: number;
  totalDeductionWtKg: number;
  netWeightKg: number;
  totalCrates: number;
  totalPcs?: number;
  createdAt: number;
}

export interface SaleRecord {
  id: string;
  userId: string;
  /** Batch this session belongs to, if any. Sessions are valid without one. */
  batchId?: string;
  phase: "main" | "cull";
  isPcsTracked: boolean;
  hasCull: boolean;
  isFinished: boolean;
  rows: MeasurementRow[];
  cullRows?: MeasurementRow[];
  createdAt: number;
  updatedAt: number;
  meta?: SaleMetaData;
}

export type RowGroup = {
  groupLabel: string;
  totalWeight: number;
  totalPcs: number;
  avgWeight: number;
  data: MeasurementRow[];
};

/**
 * A batch with its sessions rolled up. Money comes from sale_meta_data, which
 * only exists once a session is finished — so an unfinished session inside a
 * batch adds to `draftCount` but contributes nothing to revenue or discount.
 */
export interface BatchSummary {
  id: string;
  name: string;
  closedAt?: number;
  createdAt: number;
  sessionCount: number;
  draftCount: number;
  birds: number;
  weightKg: number;
  revenue: number;
  received: number;
  /** Money knocked off across the batch's sessions, not money still owed. */
  discount: number;
}

export interface DraftSummary {
  id: string;
  phase: Phase;
  createdAt: number;
  mainLog: number;
  cullLog: number;
  mainBirdCount: number;
  cullBirdCount: number;
  mainWeightKg: number;
  cullWeightKg: number;
}
