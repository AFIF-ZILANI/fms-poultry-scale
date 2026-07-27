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
import { eq, and, desc, notInArray, sql } from "drizzle-orm";
import type {
  DraftSummary,
  MeasurementRow,
  RowEditEntry,
  SaleRecord,
} from "./types";

// ─── Sales ────────────────────────────────────────────────────────────────────

// One query per screen, not one per sale. `with` walks the relations declared
// in db/schema.ts, so rows + meta + edit history come back in a single trip.
const saleWith = {
  metaData: true,
  rows: {
    with: { editHistory: true },
  },
} satisfies NonNullable<
  Parameters<typeof db.query.sales.findMany>[0]
>["with"];

type SaleWithRelations = typeof sales.$inferSelect & {
  metaData: typeof saleMetaData.$inferSelect | null;
  rows: (typeof measurementRows.$inferSelect & {
    editHistory: (typeof rowEditHistory.$inferSelect)[];
  })[];
};

function toEditEntry(h: typeof rowEditHistory.$inferSelect): RowEditEntry {
  return {
    id: h.id,
    timestamp: h.createdAt.getTime(),
    previousWeightKg: h.previousWeight,
    previousPcs: h.previousPcs,
    newWeightKg: h.newWeight,
    newPcs: h.newPcs,
    reason: h.reason ?? undefined,
  };
}

function toMeasurementRow(
  r: SaleWithRelations["rows"][number],
): MeasurementRow {
  return {
    id: r.id,
    weightKg: r.weight,
    pcs: r.pcs,
    timestamp: r.createdAt.getTime(),
    editHistory: r.editHistory.length
      ? r.editHistory.map(toEditEntry).sort((a, b) => b.timestamp - a.timestamp)
      : undefined,
  };
}

// The only place DB shape (Date, null) is translated to UI shape (epoch ms,
// undefined). Everything else works in one or the other, never both.
function toSaleRecord(row: SaleWithRelations): SaleRecord {
  const m = row.metaData;
  // Newest-first: the measurement screen numbers logs off rows[0] being the
  // most recent entry. Previously this held only by SQLite rowid accident.
  const byNewest = (a: MeasurementRow, b: MeasurementRow) =>
    b.timestamp - a.timestamp;
  const rows = row.rows
    .filter((r) => r.type === "main")
    .map(toMeasurementRow)
    .sort(byNewest);
  const cullRows = row.rows
    .filter((r) => r.type === "cull")
    .map(toMeasurementRow)
    .sort(byNewest);

  return {
    id: row.id,
    userId: row.userId,
    phase: row.phase,
    isPcsTracked: row.isPcsTracked,
    hasCull: row.hasCull,
    isFinished: row.isFinished,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    rows,
    cullRows: cullRows.length ? cullRows : undefined,
    meta: m
      ? {
          mainWeightKg: m.mainWeightKg,
          mainPcs: m.mainPcs ?? undefined,
          buyerName: m.buyerName ?? undefined,
          kgPerCrate: m.kgPerCrate,
          deductionPerCrateG: m.deductionPerCrateG,
          isFullCratesOnly: m.isFullCratesOnly,
          mainPrice: m.mainPrice,
          mainAmount: m.mainAmount,
          cullWeightKg: m.cullWeightKg,
          isCullSold: m.isCullSold ?? undefined,
          cullSaleType: m.cullSaleType ?? undefined,
          cullPrice: m.cullPrice ?? undefined,
          cullPcs: m.cullPcs ?? undefined,
          cullAmount: m.cullAmount ?? undefined,
          finalAmount: m.finalAmount,
          receivedAmount: m.receivedAmount,
          totalDeductionWtKg: m.totalDeductionWtKg,
          avgWtGrams: m.avgWtGrams ?? undefined,
          netWeightKg: m.netWeightKg,
          totalCrates: m.totalCrates,
          totalPcs: m.totalPcs ?? undefined,
          createdAt: m.createdAt.getTime(),
        }
      : undefined,
  };
}

export async function loadSales(userId: string): Promise<SaleRecord[]> {
  const rows = await db.query.sales.findMany({
    where: eq(sales.userId, userId),
    orderBy: desc(sales.createdAt),
    with: saleWith,
  });
  return (rows as SaleWithRelations[]).map(toSaleRecord);
}

export async function loadSale(id: string): Promise<SaleRecord | null> {
  const row = await db.query.sales.findFirst({
    where: eq(sales.id, id),
    with: saleWith,
  });
  return row ? toSaleRecord(row as SaleWithRelations) : null;
}

// Totals for the profile screen — aggregated in SQL, no hydration.
export async function getSaleStats(
  userId: string,
): Promise<{ totalSales: number; totalRevenue: number }> {
  const row = await db
    .select({
      totalSales: sql<number>`count(*)`,
      totalRevenue: sql<number>`coalesce(sum(${saleMetaData.finalAmount}), 0)`,
    })
    .from(sales)
    .leftJoin(saleMetaData, eq(saleMetaData.saleId, sales.id))
    .where(eq(sales.userId, userId))
    .get();

  return {
    totalSales: Number(row?.totalSales ?? 0),
    totalRevenue: Number(row?.totalRevenue ?? 0),
  };
}

// "Drafts" = anything not yet finished
export async function loadDrafts(userId: string): Promise<DraftSummary[]> {
  const rows = await db
    .select({
      id: sales.id,
      phase: sales.phase,
      createdAt: sales.createdAt,
      mainLog: sql<number>`coalesce(sum(case when ${measurementRows.type} = 'main' then 1 else 0 end), 0)`,
      cullLog: sql<number>`coalesce(sum(case when ${measurementRows.type} = 'cull' then 1 else 0 end), 0)`,
      mainBirdCount: sql<number>`coalesce(sum(case when ${measurementRows.type} = 'main' then ${measurementRows.pcs} else 0 end), 0)`,
      cullBirdCount: sql<number>`coalesce(sum(case when ${measurementRows.type} = 'cull' then ${measurementRows.pcs} else 0 end), 0)`,
      mainWeightKg: sql<number>`coalesce(sum(case when ${measurementRows.type} = 'main' then ${measurementRows.weight} else 0 end), 0)`,
      cullWeightKg: sql<number>`coalesce(sum(case when ${measurementRows.type} = 'cull' then ${measurementRows.weight} else 0 end), 0)`,
    })
    .from(sales)
    .leftJoin(measurementRows, eq(measurementRows.saleId, sales.id))
    .where(and(eq(sales.userId, userId), eq(sales.isFinished, false)))
    .groupBy(sales.id)
    .orderBy(desc(sales.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    phase: r.phase,
    createdAt: r.createdAt.getTime(),
    mainLog: Number(r.mainLog),
    cullLog: Number(r.cullLog),
    mainBirdCount: Number(r.mainBirdCount),
    cullBirdCount: Number(r.cullBirdCount),
    mainWeightKg: Number(r.mainWeightKg),
    cullWeightKg: Number(r.cullWeightKg),
  }));
}

export async function saveSale(
  userId: string,
  sale: SaleRecord,
): Promise<void> {
  const incoming = [
    ...sale.rows.map((r) => ({ ...r, type: "main" as const })),
    ...(sale.cullRows ?? []).map((r) => ({ ...r, type: "cull" as const })),
  ];

  // The expo-sqlite driver is synchronous: drizzle calls this callback and
  // commits as soon as it returns. An async callback would return a pending
  // promise, so COMMIT would fire before any write ran — nothing would
  // actually be inside the transaction. Every statement here uses .run().
  db.transaction((tx) => {
    tx
      .insert(sales)
      .values({
        id: sale.id,
        userId,
        phase: sale.phase,
        isPcsTracked: sale.isPcsTracked,
        hasCull: sale.hasCull,
        isFinished: sale.isFinished,
        createdAt: new Date(sale.createdAt),
        updatedAt: new Date(sale.updatedAt),
      })
      .onConflictDoUpdate({
        target: sales.id,
        set: {
          phase: sale.phase,
          isPcsTracked: sale.isPcsTracked,
          hasCull: sale.hasCull,
          isFinished: sale.isFinished,
          updatedAt: new Date(sale.updatedAt),
        },
      })
      .run();

    // Rows are upserted, not wiped and re-inserted: deleting a row cascades
    // into row_edit_history, which would erase the audit trail on every save.
    const keepIds = incoming.map((r) => r.id);
    tx
      .delete(measurementRows)
      .where(
        keepIds.length
          ? and(
              eq(measurementRows.saleId, sale.id),
              notInArray(measurementRows.id, keepIds),
            )
          : eq(measurementRows.saleId, sale.id),
      )
      .run();

    if (incoming.length) {
      tx
        .insert(measurementRows)
        .values(
          incoming.map((r) => ({
            id: r.id,
            saleId: sale.id,
            type: r.type,
            weight: r.weightKg,
            pcs: r.pcs,
            createdAt: new Date(r.timestamp),
          })),
        )
        .onConflictDoUpdate({
          target: measurementRows.id,
          set: {
            type: sql`excluded.type`,
            weight: sql`excluded.weight`,
            pcs: sql`excluded.pcs`,
          },
        })
        .run();

      // Edit history is append-only; entries carry stable ids from the UI, so
      // re-saving an already-persisted edit is a no-op.
      const history = incoming.flatMap((r) =>
        (r.editHistory ?? []).map((h) => ({
          id: h.id,
          rowId: r.id,
          previousWeight: h.previousWeightKg,
          previousPcs: h.previousPcs,
          newWeight: h.newWeightKg,
          newPcs: h.newPcs,
          reason: h.reason ?? null,
          createdAt: new Date(h.timestamp),
        })),
      );
      if (history.length) {
        tx.insert(rowEditHistory).values(history).onConflictDoNothing().run();
      }
    }

    if (sale.meta) {
      const m = sale.meta;
      const values = {
        saleId: sale.id,
        mainWeightKg: m.mainWeightKg,
        mainPcs: m.mainPcs,
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
        totalDeductionWtKg: m.totalDeductionWtKg,
        avgWtGrams: m.avgWtGrams,
        netWeightKg: m.netWeightKg,
        totalCrates: m.totalCrates,
        totalPcs: m.totalPcs,
        createdAt: new Date(m.createdAt),
      };
      const { saleId: _pk, ...updatable } = values;
      tx
        .insert(saleMetaData)
        .values(values)
        .onConflictDoUpdate({ target: saleMetaData.saleId, set: updatable })
        .run();
    } else {
      tx.delete(saleMetaData).where(eq(saleMetaData.saleId, sale.id)).run();
    }
  });
}

export async function deleteSale(id: string): Promise<void> {
  await db.delete(sales).where(eq(sales.id, id));
}

// ─── User Prefs ───────────────────────────────────────────────────────────────

export const PREF_DEFAULTS = {
  language: "en",
  theme: "system",
  logGroupSize: 10,
  kgPerCrate: 0,
  deductionWtG: 0,
  priceKg: 0,
} as const;

export type UserPrefs = typeof userPrefs.$inferSelect;

// Always returns a usable object, so callers never repeat the defaults.
export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  const row = await db
    .select()
    .from(userPrefs)
    .where(eq(userPrefs.userId, userId))
    .get();
  return row ?? { userId, ...PREF_DEFAULTS };
}

export async function saveUserPrefs(
  userId: string,
  prefs: Partial<Omit<UserPrefs, "userId">>,
): Promise<void> {
  await db
    .insert(userPrefs)
    .values({ userId, ...PREF_DEFAULTS, ...prefs })
    .onConflictDoUpdate({
      target: userPrefs.userId,
      // `SET` with no assignments is a SQLite syntax error — an empty patch
      // becomes a self-assignment no-op.
      set: Object.keys(prefs).length ? prefs : { userId },
    });
}

export const getChunkSize = async (userId: string) =>
  (await getUserPrefs(userId)).logGroupSize;
export const setChunkSize = (userId: string, size: number) =>
  saveUserPrefs(userId, { logGroupSize: size });

export const loadLastPricePerKg = async (userId: string) =>
  (await getUserPrefs(userId)).priceKg;
export const saveLastPricePerKg = (userId: string, v: number) =>
  saveUserPrefs(userId, { priceKg: v });

export const loadLastKgPerCrate = async (userId: string) =>
  (await getUserPrefs(userId)).kgPerCrate;
export const saveLastKgPerCrate = (userId: string, v: number) =>
  saveUserPrefs(userId, { kgPerCrate: v });

export const loadLastDeductionG = async (userId: string) =>
  (await getUserPrefs(userId)).deductionWtG;
export const saveLastDeductionG = (userId: string, v: number) =>
  saveUserPrefs(userId, { deductionWtG: v });

export const loadLanguagePref = async (userId: string) =>
  (await getUserPrefs(userId)).language;
export const saveLanguagePref = (userId: string, v: "en" | "bn") =>
  saveUserPrefs(userId, { language: v });

export const loadThemePref = async (userId: string) =>
  (await getUserPrefs(userId)).theme;
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
