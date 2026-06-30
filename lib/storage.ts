// lib/storage.ts
import { db } from "../db/client";
import {
  sales,
  measurementRows,
  tradeDeductions,
  drafts,
  prefs,
} from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import type {
  MeasurementRow,
  SaleRecord,
  DraftSession,
  TradeDeduction,
} from "./types";

// ─── Sales ────────────────────────────────────────────────────────────────────

async function hydrateSale(
  saleRow: typeof sales.$inferSelect,
): Promise<SaleRecord> {
  const allRows = await db
    .select()
    .from(measurementRows)
    .where(eq(measurementRows.saleId, saleRow.id));

  const rows: MeasurementRow[] = allRows
    .filter((r) => r.kind === "main")
    .map((r) => ({
      id: r.id,
      weightKg: r.weightKg,
      pcs: r.pcs,
      timestamp: r.timestamp.getTime(),
    }));

  const cullRows: MeasurementRow[] = allRows
    .filter((r) => r.kind === "cull")
    .map((r) => ({
      id: r.id,
      weightKg: r.weightKg,
      pcs: r.pcs,
      timestamp: r.timestamp.getTime(),
    }));

  const deductionRow = await db
    .select()
    .from(tradeDeductions)
    .where(eq(tradeDeductions.saleId, saleRow.id))
    .get();

  const deduction: TradeDeduction | undefined = deductionRow
    ? {
        gross_weight: deductionRow.grossWeight,
        kg_per_crate: deductionRow.kgPerCrate,
        deduction_per_crate_g: deductionRow.deductionPerCrateG,
        full_crates_only: deductionRow.fullCratesOnly,
        total_crates: deductionRow.totalCrates,
        total_deduction_kg: deductionRow.totalDeductionKg,
        cull_weight_kg: deductionRow.cullWeightKg,
        net_weight: deductionRow.netWeight,
        price_per_kg: deductionRow.pricePerKg,
        main_amount: deductionRow.mainAmount ?? undefined,
        cull_session_mode: deductionRow.cullSessionMode ?? undefined,
        cull_sold: deductionRow.cullSold ?? undefined,
        cull_pricing_mode: deductionRow.cullPricingMode ?? undefined,
        cull_price: deductionRow.cullPrice ?? undefined,
        cull_pcs: deductionRow.cullPcs ?? undefined,
        cull_amount: deductionRow.cullAmount ?? undefined,
        final_amount: deductionRow.finalAmount,
      }
    : undefined;

  return {
    id: saleRow.id,
    totalWeightKg: saleRow.totalWeightKg,
    totalWeightGrams: saleRow.totalWeightGrams,
    totalPcs: saleRow.totalPcs,
    pcsTracked: saleRow.pcsTracked ?? undefined,
    averageWeightKg: saleRow.averageWeightKg,
    averageWeightGrams: saleRow.averageWeightGrams,
    rows,
    cullRows: cullRows.length ? cullRows : undefined,
    createdAt: saleRow.createdAt.getTime(),
    deduction,
    receivedAmount: saleRow.receivedAmount ?? undefined,
    buyerName: saleRow.buyerName ?? undefined,
  };
}

export async function loadSales(userId: string): Promise<SaleRecord[]> {
  const saleRows = await db
    .select()
    .from(sales)
    .where(eq(sales.userId, userId))
    .orderBy(desc(sales.createdAt));

  // N+1 by design here — fine at local-device scale (dozens/hundreds of sales),
  // revisit with a single joined query if a user's sale count grows large.
  return Promise.all(saleRows.map(hydrateSale));
}

export async function saveSale(
  userId: string,
  sale: SaleRecord,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(sales)
      .values({
        id: sale.id,
        userId,
        totalWeightKg: sale.totalWeightKg,
        totalWeightGrams: sale.totalWeightGrams,
        totalPcs: sale.totalPcs,
        pcsTracked: sale.pcsTracked,
        averageWeightKg: sale.averageWeightKg,
        averageWeightGrams: sale.averageWeightGrams,
        buyerName: sale.buyerName,
        receivedAmount: sale.receivedAmount,
        createdAt: new Date(sale.createdAt),
      })
      .onConflictDoUpdate({
        target: sales.id,
        set: {
          totalWeightKg: sale.totalWeightKg,
          totalWeightGrams: sale.totalWeightGrams,
          totalPcs: sale.totalPcs,
          pcsTracked: sale.pcsTracked,
          averageWeightKg: sale.averageWeightKg,
          averageWeightGrams: sale.averageWeightGrams,
          buyerName: sale.buyerName,
          receivedAmount: sale.receivedAmount,
        },
      });

    // Replace-all strategy for rows, same effective behavior as your old
    // INSERT OR REPLACE on the whole blob.
    await tx.delete(measurementRows).where(eq(measurementRows.saleId, sale.id));

    const rowsToInsert = [
      ...sale.rows.map((r) => ({ ...r, kind: "main" as const })),
      ...(sale.cullRows ?? []).map((r) => ({ ...r, kind: "cull" as const })),
    ];
    if (rowsToInsert.length) {
      await tx.insert(measurementRows).values(
        rowsToInsert.map((r) => ({
          id: r.id,
          saleId: sale.id,
          draftId: null,
          kind: r.kind,
          weightKg: r.weightKg,
          pcs: r.pcs,
          timestamp: new Date(r.timestamp),
        })),
      );
    }

    await tx.delete(tradeDeductions).where(eq(tradeDeductions.saleId, sale.id));
    if (sale.deduction) {
      const d = sale.deduction;
      await tx.insert(tradeDeductions).values({
        id: crypto.randomUUID(),
        saleId: sale.id,
        grossWeight: d.gross_weight,
        kgPerCrate: d.kg_per_crate,
        deductionPerCrateG: d.deduction_per_crate_g,
        fullCratesOnly: d.full_crates_only,
        totalCrates: d.total_crates,
        totalDeductionKg: d.total_deduction_kg,
        cullWeightKg: d.cull_weight_kg,
        netWeight: d.net_weight,
        pricePerKg: d.price_per_kg,
        mainAmount: d.main_amount,
        cullSessionMode: d.cull_session_mode,
        cullSold: d.cull_sold,
        cullPricingMode: d.cull_pricing_mode,
        cullPrice: d.cull_price,
        cullPcs: d.cull_pcs,
        cullAmount: d.cull_amount,
        finalAmount: d.final_amount,
      });
    }
  });
}

export async function deleteSale(id: string): Promise<void> {
  // Cascade handles measurementRows + tradeDeductions, IF foreign_keys pragma is ON.
  await db.delete(sales).where(eq(sales.id, id));
}

export async function updateSale(
  saleId: string,
  updatedRows: MeasurementRow[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const saleRow = await tx
      .select()
      .from(sales)
      .where(eq(sales.id, saleId))
      .get();
    if (!saleRow) return;

    const deductionRow = await tx
      .select()
      .from(tradeDeductions)
      .where(eq(tradeDeductions.saleId, saleId))
      .get();

    const totalWeightKg = updatedRows.reduce((s, r) => s + r.weightKg, 0);
    const totalPcs = updatedRows.reduce((s, r) => s + (r.pcs ?? 0), 0);
    const avgWeightKg = totalPcs > 0 ? totalWeightKg / totalPcs : 0;

    await tx
      .update(sales)
      .set({
        totalWeightKg,
        totalWeightGrams: Math.round(totalWeightKg * 1000),
        totalPcs,
        averageWeightKg: avgWeightKg,
        averageWeightGrams: Math.round(avgWeightKg * 1000),
      })
      .where(eq(sales.id, saleId));

    // Only main rows are editable here — cull rows are untouched, matching old behavior.
    await tx
      .delete(measurementRows)
      .where(
        and(
          eq(measurementRows.saleId, saleId),
          eq(measurementRows.kind, "main"),
        ),
      );
    await tx.insert(measurementRows).values(
      updatedRows.map((r) => ({
        id: r.id,
        saleId,
        draftId: null,
        kind: "main" as const,
        weightKg: r.weightKg,
        pcs: r.pcs,
        timestamp: new Date(r.timestamp),
      })),
    );

    if (deductionRow) {
      const rawCrates = totalWeightKg / deductionRow.kgPerCrate;
      const totalCrates = deductionRow.fullCratesOnly
        ? Math.floor(rawCrates)
        : rawCrates;
      const totalDeductionKg =
        (totalCrates * deductionRow.deductionPerCrateG) / 1000;
      const netWeight = Math.max(
        0,
        totalWeightKg - totalDeductionKg - deductionRow.cullWeightKg,
      );
      const mainAmount = netWeight * deductionRow.pricePerKg;
      const finalAmount = mainAmount + (deductionRow.cullAmount ?? 0);

      await tx
        .update(tradeDeductions)
        .set({
          grossWeight: totalWeightKg,
          totalCrates,
          totalDeductionKg,
          netWeight,
          mainAmount,
          finalAmount,
        })
        .where(eq(tradeDeductions.saleId, saleId));
    }
  });
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

async function hydrateDraft(
  draftRow: typeof drafts.$inferSelect,
): Promise<DraftSession> {
  const allRows = await db
    .select()
    .from(measurementRows)
    .where(eq(measurementRows.draftId, draftRow.id));

  const activeRows = allRows
    .filter((r) => r.kind === (draftRow.phase ?? "main"))
    .map((r) => ({
      id: r.id,
      weightKg: r.weightKg,
      pcs: r.pcs,
      timestamp: r.timestamp.getTime(),
    }));

  return {
    id: draftRow.id,
    rows: activeRows,
    phase: (draftRow.phase as "main" | "cull") ?? undefined,
    pcsOptional: draftRow.pcsOptional ?? undefined,
    createdAt: draftRow.createdAt.getTime(),
    updatedAt: draftRow.updatedAt.getTime(),
    totalWeightKg: draftRow.totalWeightKg,
    totalPcs: draftRow.totalPcs,
  };
}

export async function loadDrafts(userId: string): Promise<DraftSession[]> {
  const draftRows = await db
    .select()
    .from(drafts)
    .where(eq(drafts.userId, userId))
    .orderBy(desc(drafts.updatedAt));
  return Promise.all(draftRows.map(hydrateDraft));
}

export async function loadDraft(id: string): Promise<DraftSession | null> {
  const draftRow = await db
    .select()
    .from(drafts)
    .where(eq(drafts.id, id))
    .get();
  return draftRow ? hydrateDraft(draftRow) : null;
}

export async function saveDraft(
  userId: string,
  draft: DraftSession,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(drafts)
      .values({
        id: draft.id,
        userId,
        phase: draft.phase,
        pcsOptional: draft.pcsOptional,
        totalWeightKg: draft.totalWeightKg,
        totalPcs: draft.totalPcs,
        createdAt: new Date(draft.createdAt),
        updatedAt: new Date(draft.updatedAt),
      })
      .onConflictDoUpdate({
        target: drafts.id,
        set: {
          phase: draft.phase,
          pcsOptional: draft.pcsOptional,
          totalWeightKg: draft.totalWeightKg,
          totalPcs: draft.totalPcs,
          updatedAt: new Date(draft.updatedAt),
        },
      });

    // Only replace rows for the CURRENT phase — locked main rows from a
    // prior phase must never be touched here, per your "locked after
    // phase switch" rule.
    const currentKind = draft.phase ?? "main";
    await tx
      .delete(measurementRows)
      .where(
        and(
          eq(measurementRows.draftId, draft.id),
          eq(measurementRows.kind, currentKind),
        ),
      );

    if (draft.rows.length) {
      await tx.insert(measurementRows).values(
        draft.rows.map((r) => ({
          id: r.id,
          saleId: null,
          draftId: draft.id,
          kind: currentKind,
          weightKg: r.weightKg,
          pcs: r.pcs,
          timestamp: new Date(r.timestamp),
        })),
      );
    }
  });
}

export async function deleteDraft(id: string): Promise<void> {
  await db.delete(drafts).where(eq(drafts.id, id));
}

// ─── Preferences ──────────────────────────────────────────────────────────────
// Unchanged in shape — prefs stays correctly key-value, no normalization needed.

async function getPref(key: string): Promise<string> {
  const row = await db.select().from(prefs).where(eq(prefs.key, key)).get();
  return row?.value ?? "";
}

async function setPref(key: string, value: string): Promise<void> {
  await db
    .insert(prefs)
    .values({ key, value })
    .onConflictDoUpdate({ target: prefs.key, set: { value } });
}

const uk = (userId: string, name: string) => `${userId}:${name}`;
const CHUNK_SIZE_KEY = "chunkSize";
export const DEFAULT_CHUNK_SIZE = 10;

export async function getChunkSize(userId: string): Promise<number> {
  const val = await getPref(uk(userId, CHUNK_SIZE_KEY));
  return val ? parseInt(val, 10) : DEFAULT_CHUNK_SIZE;
}
export async function setChunkSize(
  userId: string,
  size: number,
): Promise<void> {
  await setPref(uk(userId, CHUNK_SIZE_KEY), size.toString());
}

export const loadLastPricePerKg = (uid: string) =>
  getPref(uk(uid, "last_price_per_kg"));
export const saveLastPricePerKg = (uid: string, v: string) =>
  setPref(uk(uid, "last_price_per_kg"), v);
export const loadLastKgPerCrate = (uid: string) =>
  getPref(uk(uid, "last_kg_per_crate"));
export const saveLastKgPerCrate = (uid: string, v: string) =>
  setPref(uk(uid, "last_kg_per_crate"), v);
export const loadLastDeductionG = (uid: string) =>
  getPref(uk(uid, "last_deduction_g"));
export const saveLastDeductionG = (uid: string, v: string) =>
  setPref(uk(uid, "last_deduction_g"), v);
export const loadLanguagePref = (uid: string) => getPref(uk(uid, "language"));
export const saveLanguagePref = (uid: string, v: string) =>
  setPref(uk(uid, "language"), v);
export const loadThemePref = (uid: string) =>
  getPref(uk(uid, "theme_preference"));
export const saveThemePref = (uid: string, v: string) =>
  setPref(uk(uid, "theme_preference"), v);
export const loadFarmName = (uid: string) => getPref(uk(uid, "farm_name"));
export const saveFarmName = (uid: string, v: string) =>
  setPref(uk(uid, "farm_name"), v);
export const loadSubscriptionPlan = (uid: string) =>
  getPref(uk(uid, "subscription_plan"));
export const saveSubscriptionPlan = (uid: string, v: string) =>
  setPref(uk(uid, "subscription_plan"), v);
