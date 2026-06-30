// lib/storage.ts
import { db } from "../db/client";
import {
  users,
  sales,
  saleMetaData,
  measurementRows,
  rowEditHistory,
  userPrefs,
} from "../db/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import type { MeasurementRow, SaleRecord, SaleMetaData } from "./types";

// ─── Sales ────────────────────────────────────────────────────────────────────

async function hydrateSale(
  saleRow: typeof sales.$inferSelect,
): Promise<SaleRecord> {
  const allRows = await db
    .select()
    .from(measurementRows)
    .where(eq(measurementRows.saleId, saleRow.id));

  const rows: MeasurementRow[] = allRows
    .filter((r) => r.type === "main")
    .map((r) => ({
      id: r.id,
      weightKg: r.weight,
      pcs: r.pcs,
      timestamp: r.createdAt.getTime(),
    }));

  const cullRows: MeasurementRow[] = allRows
    .filter((r) => r.type === "cull")
    .map((r) => ({
      id: r.id,
      weightKg: r.weight,
      pcs: r.pcs,
      timestamp: r.createdAt.getTime(),
    }));

  const metaRow = db
    .select()
    .from(saleMetaData)
    .where(eq(saleMetaData.saleId, saleRow.id))
    .get();

  return {
    id: saleRow.id,
    userId: saleRow.userId,
    phase: saleRow.phase,
    isPcsTracked: saleRow.isPcsTracked,
    hasCull: saleRow.hasCull,
    createdAt: saleRow.createdAt.getTime(),
    updatedAt: saleRow.updatedAt.getTime(),
    syncedAt: saleRow.syncedAt?.getTime() ?? undefined,
    rows,
    isFinished: saleRow.isFinished,
    cullRows: cullRows.length ? cullRows : undefined,
    meta: metaRow
      ? {
          mainWeightKg: metaRow.mainWeightKg,
          totalPcs: metaRow.totalPcs ?? undefined,
          buyerName: metaRow.buyerName ?? undefined,
          kgPerCrate: metaRow.kgPerCrate,
          deductionPerCrateG: metaRow.deductionPerCrateG,
          isFullCratesOnly: metaRow.isFullCratesOnly,
          mainPrice: metaRow.mainPrice,
          mainAmount: metaRow.mainAmount,
          cullWeightKg: metaRow.cullWeightKg,
          isCullSold: metaRow.isCullSold ?? undefined,
          cullSaleType: metaRow.cullSaleType ?? undefined,
          cullPrice: metaRow.cullPrice ?? undefined,
          cullPcs: metaRow.cullPcs ?? undefined,
          cullAmount: metaRow.cullAmount ?? undefined,
          finalAmount: metaRow.finalAmount,
          receivedAmount: metaRow.receivedAmount ?? undefined,
        }
      : undefined,
  };
}

export async function loadSales(userId: string): Promise<SaleRecord[]> {
  const saleRows = await db
    .select()
    .from(sales)
    .where(eq(sales.userId, userId))
    .orderBy(desc(sales.createdAt));
  return Promise.all(saleRows.map(hydrateSale));
}

// "Drafts" = anything not yet finished
export async function loadDrafts(userId: string): Promise<SaleRecord[]> {
  const saleRows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.userId, userId), eq(sales.isFinished, false)))
    .orderBy(desc(sales.updatedAt));
  return Promise.all(saleRows.map(hydrateSale));
}

export async function loadSale(id: string): Promise<SaleRecord | null> {
  const saleRow = await db.select().from(sales).where(eq(sales.id, id)).get();
  return saleRow ? hydrateSale(saleRow) : null;
}

// Starts a brand new sale, always in "main" phase. No way to start
// directly in "cull" — matches your stated flow.
export async function createSale(
  userId: string,
  isPcsTracked: boolean,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(sales).values({
    id,
    userId,
    phase: "main",
    isPcsTracked,
    hasCull: false,
    isFinished: false,
    createdAt: now,
    updatedAt: now,
  });
  return id;
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
        phase: sale.phase,
        isPcsTracked: sale.isPcsTracked,
        hasCull: sale.hasCull,
        createdAt: new Date(sale.createdAt),
        updatedAt: new Date(sale.updatedAt),
        syncedAt: sale.syncedAt ? new Date(sale.syncedAt) : null,
      })
      .onConflictDoUpdate({
        target: sales.id,
        set: {
          phase: sale.phase,
          isPcsTracked: sale.isPcsTracked,
          hasCull: sale.hasCull,
          updatedAt: new Date(sale.updatedAt),
          syncedAt: sale.syncedAt ? new Date(sale.syncedAt) : null,
        },
      });

    await tx.delete(measurementRows).where(eq(measurementRows.saleId, sale.id));
    const rowsToInsert = [
      ...sale.rows.map((r) => ({ ...r, type: "main" as const })),
      ...(sale.cullRows ?? []).map((r) => ({ ...r, type: "cull" as const })),
    ];
    if (rowsToInsert.length) {
      await tx.insert(measurementRows).values(
        rowsToInsert.map((r) => ({
          id: r.id,
          saleId: sale.id,
          type: r.type,
          weight: r.weightKg,
          pcs: r.pcs,
          createdAt: new Date(r.timestamp),
        })),
      );
    }

    await tx.delete(saleMetaData).where(eq(saleMetaData.saleId, sale.id));
    if (sale.meta) {
      const m = sale.meta;
      await tx.insert(saleMetaData).values({
        id: crypto.randomUUID(),
        saleId: sale.id,
        mainWeightKg: m.mainWeightKg,
        totalPcs: m.totalPcs,
        buyerName: m.buyerName,
        kgPerCrate: m.kgPerCrate,
        deductionPerCrateG: m.deductionPerCrateG,
        isFullCratesOnly: m.isFullCratesOnly,
        mainPrice: m.mainPrice,
        mainAmount: m.mainAmount,
        cullWeightKg: m.cullWeightKg,
        isCullSold: m.isCullSold,
        cullSaleType: m.cullSaleType,
        cullPrice: m.cullPrice,
        cullPcs: m.cullPcs,
        cullAmount: m.cullAmount,
        finalAmount: m.finalAmount,
        receivedAmount: m.receivedAmount,
        createdAt: new Date(sale.createdAt),
      });
    }
  });
}

export async function deleteSale(id: string): Promise<void> {
  await db.delete(sales).where(eq(sales.id, id));
}

// User tapped "Finish" on the main session, then said YES to the
// cull dialog. Locks nothing — main rows stay editable in theory,
// but UI should treat them as committed at this point.
export async function startCullPhase(saleId: string): Promise<void> {
  await db
    .update(sales)
    .set({ phase: "cull", hasCull: true, updatedAt: new Date() })
    .where(and(eq(sales.id, saleId), eq(sales.phase, "main")));
  // Guard: only transitions out of "main". Calling this on a sale
  // already in "cull" or "finished" is a no-op, not an error —
  // decide if you'd rather it throw. Right now it silently does nothing,
  // which can hide a bug in your UI flow if you call this twice.
}

// User tapped "Finish" and said NO to the cull dialog (locks immediately),
// OR user finished an active cull session.
export async function finishSale(saleId: string): Promise<void> {
  await db
    .update(sales)
    .set({ isFinished: true, updatedAt: new Date() })
    .where(eq(sales.id, saleId));
}

export async function updateSale(
  saleId: string,
  updatedRows: MeasurementRow[],
  reason?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const saleRow = await tx
      .select()
      .from(sales)
      .where(eq(sales.id, saleId))
      .get();
    if (!saleRow) return;

    if (saleRow.isFinished) {
      // Hard stop — editing a finished sale silently was exactly the
      // bug risk I flagged last time. Throwing here, not swallowing it.
      throw new Error(`Cannot edit rows on finished sale ${saleId}`);
    }

    const metaRow = await tx
      .select()
      .from(saleMetaData)
      .where(eq(saleMetaData.saleId, saleId))
      .get();

    const editableType = saleRow.phase; // "main" or "cull"
    const existingRows = await tx
      .select()
      .from(measurementRows)
      .where(
        and(
          eq(measurementRows.saleId, saleId),
          eq(measurementRows.type, editableType),
        ),
      );

    const existingById = new Map(existingRows.map((r) => [r.id, r]));
    for (const updated of updatedRows) {
      const prev = existingById.get(updated.id);
      if (
        prev &&
        (prev.weight !== updated.weightKg || prev.pcs !== updated.pcs)
      ) {
        await tx.insert(rowEditHistory).values({
          id: crypto.randomUUID(),
          rowId: prev.id,
          previousWeight: prev.weight,
          previousPcs: prev.pcs,
          newWeight: updated.weightKg,
          newPcs: updated.pcs,
          reason: reason ?? null,
          createdAt: new Date(),
        });
      }
    }

    const totalWeightKg = updatedRows.reduce((s, r) => s + r.weightKg, 0);
    const totalPcs = updatedRows.reduce((s, r) => s + (r.pcs ?? 0), 0);
    const avgWeightKg = totalPcs > 0 ? totalWeightKg / totalPcs : 0;

    await tx
      .update(sales)
      .set({ updatedAt: new Date() })
      .where(eq(sales.id, saleId));

    await tx
      .delete(measurementRows)
      .where(
        and(
          eq(measurementRows.saleId, saleId),
          eq(measurementRows.type, editableType),
        ),
      );
    await tx.insert(measurementRows).values(
      updatedRows.map((r) => ({
        id: r.id,
        saleId,
        type: editableType,
        weight: r.weightKg,
        pcs: r.pcs,
        createdAt: new Date(r.timestamp),
      })),
    );

    // Only recompute main-side financials when editing main rows.
    // Editing cull rows during cull phase should recompute cull amounts —
    // not implemented here since you haven't given me the cull pricing
    // formula explicitly (per-kg vs per-piece math). Flagging, not guessing.
    if (metaRow && editableType === "main") {
      const rawCrates = totalWeightKg / metaRow.kgPerCrate;
      const totalCrates = metaRow.isFullCratesOnly
        ? Math.floor(rawCrates)
        : rawCrates;
      const totalDeductionKg =
        (totalCrates * metaRow.deductionPerCrateG) / 1000;
      const netWeight = Math.max(
        0,
        totalWeightKg - totalDeductionKg - metaRow.cullWeightKg,
      );
      const mainAmount = netWeight * metaRow.mainPrice;
      const finalAmount = mainAmount + (metaRow.cullAmount ?? 0);

      await tx
        .update(saleMetaData)
        .set({
          mainWeightKg: totalWeightKg,
          totalPcs,
          mainAmount,
          finalAmount,
        })
        .where(eq(saleMetaData.saleId, saleId));
    }
  });
}

// ─── User Prefs ───────────────────────────────────────────────────────────────

export async function getUserPrefs(userId: string) {
  return db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).get();
}

export async function saveUserPrefs(
  userId: string,
  prefs: {
    language?: "en" | "bn";
    theme?: "light" | "dark" | "system";
    logGroupSize?: number;
    kgPerCrate?: number;
    deductionWtG?: number;
    priceKg?: number;
  },
): Promise<void> {
  await db
    .insert(userPrefs)
    .values({
      userId,
      language: prefs.language ?? "en",
      theme: prefs.theme ?? "system",
      logGroupSize: prefs.logGroupSize ?? 10,
      kgPerCrate: prefs.kgPerCrate ?? 0,
      deductionWtG: prefs.deductionWtG ?? 0,
      priceKg: prefs.priceKg ?? 0,
    })
    .onConflictDoUpdate({ target: userPrefs.userId, set: prefs });
}

export const getChunkSize = async (userId: string) =>
  (await getUserPrefs(userId))?.logGroupSize ?? 10;
export const setChunkSize = (userId: string, size: number) =>
  saveUserPrefs(userId, { logGroupSize: size });

export const loadLastPricePerKg = async (userId: string) =>
  (await getUserPrefs(userId))?.priceKg ?? 0;
export const saveLastPricePerKg = (userId: string, v: number) =>
  saveUserPrefs(userId, { priceKg: v });

export const loadLastKgPerCrate = async (userId: string) =>
  (await getUserPrefs(userId))?.kgPerCrate ?? 0;
export const saveLastKgPerCrate = (userId: string, v: number) =>
  saveUserPrefs(userId, { kgPerCrate: v });

export const loadLastDeductionG = async (userId: string) =>
  (await getUserPrefs(userId))?.deductionWtG ?? 0;
export const saveLastDeductionG = (userId: string, v: number) =>
  saveUserPrefs(userId, { deductionWtG: v });

export const loadLanguagePref = async (userId: string) =>
  (await getUserPrefs(userId))?.language ?? "en";
export const saveLanguagePref = (userId: string, v: "en" | "bn") =>
  saveUserPrefs(userId, { language: v });

export const loadThemePref = async (userId: string) =>
  (await getUserPrefs(userId))?.theme ?? "system";
export const saveThemePref = (userId: string, v: "light" | "dark" | "system") =>
  saveUserPrefs(userId, { theme: v });

export const loadFarmName = async (userId: string) =>
  (await db.select().from(users).where(eq(users.id, userId)).get())?.farmName ??
  "";
export const saveFarmName = (userId: string, v: string) =>
  db.update(users).set({ farmName: v }).where(eq(users.id, userId));

export const loadSubscriptionPlan = async (userId: string) =>
  (await db.select().from(users).where(eq(users.id, userId)).get())
    ?.subscriptionPlan ?? "community";
export const saveSubscriptionPlan = (
  userId: string,
  v: "community" | "premium",
) => db.update(users).set({ subscriptionPlan: v }).where(eq(users.id, userId));
