import { and, eq } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/db/client";
import {
  dataBackupQueue,
  users,
  userPrefs,
  batches,
  sales,
  saleMetaData,
  measurementRows,
  rowEditHistory,
} from "@/db/schema";
import { SYNCED_TABLES, PK_COLUMN, type SyncedTable } from "./tables";

// Reads the row's *current* local state, not a stored diff — that's what
// lets repeated edits collapse into one push (see the queue's PK in
// db/schema.ts). Returns null if the row was deleted locally before this
// flush ran; the caller treats that as "nothing to push, but fine."
async function readCurrentRow(table: SyncedTable, id: string): Promise<Record<string, unknown> | null> {
  switch (table) {
    case "users":
      return (await db.select().from(users).where(eq(users.id, id)).get()) ?? null;
    case "user_prefs":
      return (await db.select().from(userPrefs).where(eq(userPrefs.userId, id)).get()) ?? null;
    case "batches":
      return (await db.select().from(batches).where(eq(batches.id, id)).get()) ?? null;
    case "sales":
      return (await db.select().from(sales).where(eq(sales.id, id)).get()) ?? null;
    case "sale_meta_data":
      return (await db.select().from(saleMetaData).where(eq(saleMetaData.saleId, id)).get()) ?? null;
    case "measurement_rows":
      return (await db.select().from(measurementRows).where(eq(measurementRows.id, id)).get()) ?? null;
    case "row_edit_history":
      return (await db.select().from(rowEditHistory).where(eq(rowEditHistory.id, id)).get()) ?? null;
  }
}

// The remote mirror uses snake_case columns (see supabase/backup_mirror.sql);
// Drizzle's .select() returns camelCase JS keys. Explicit per-table mapping,
// not a generic key-case converter — users.is_onboarded is the one field
// whose JS property name is already snake_case, so a blanket converter would
// get that field wrong (mirrors Task 6's fromRemoteXxx for the same reason).
function toRemoteUser(r: typeof users.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    location: r.location,
    farm_name: r.farmName,
    is_onboarded: r.is_onboarded,
    business_name: r.businessName,
    role: r.role,
    subscription_plan: r.subscriptionPlan,
    farm_capacity: r.farmCapacity,
    buying_capacity: r.buyingCapacity,
    breed: r.breed,
    supply_regions: r.supplyRegions,
    created_at: r.createdAt,
  };
}

function toRemoteUserPrefs(r: typeof userPrefs.$inferSelect) {
  return {
    user_id: r.userId,
    language: r.language,
    theme: r.theme,
    log_group_size: r.logGroupSize,
    kg_per_crate: r.kgPerCrate,
    deduction_wt_g: r.deductionWtG,
    price_kg: r.priceKg,
  };
}

function toRemoteBatch(r: typeof batches.$inferSelect) {
  return {
    id: r.id,
    user_id: r.userId,
    name: r.name,
    closed_at: r.closedAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

function toRemoteSale(r: typeof sales.$inferSelect) {
  return {
    id: r.id,
    user_id: r.userId,
    batch_id: r.batchId,
    phase: r.phase,
    is_pcs_tracked: r.isPcsTracked,
    has_cull: r.hasCull,
    is_finished: r.isFinished,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

function toRemoteSaleMeta(r: typeof saleMetaData.$inferSelect) {
  return {
    sale_id: r.saleId,
    main_weight_kg: r.mainWeightKg,
    main_pcs: r.mainPcs,
    buyer_name: r.buyerName,
    kg_per_crate: r.kgPerCrate,
    deduction_per_crate_g: r.deductionPerCrateG,
    is_full_crates_only: r.isFullCratesOnly,
    main_price: r.mainPrice,
    main_amount: r.mainAmount,
    cull_weight_kg: r.cullWeightKg,
    is_cull_sold: r.isCullSold,
    cull_sale_type: r.cullSaleType,
    cull_price: r.cullPrice,
    cull_pcs: r.cullPcs,
    cull_amount: r.cullAmount,
    final_amount: r.finalAmount,
    received_amount: r.receivedAmount,
    total_deduction_wt_kg: r.totalDeductionWtKg,
    avg_wt_grams: r.avgWtGrams,
    net_weight_kg: r.netWeightKg,
    total_crates: r.totalCrates,
    total_pcs: r.totalPcs,
    created_at: r.createdAt,
  };
}

function toRemoteMeasurementRow(r: typeof measurementRows.$inferSelect) {
  return {
    id: r.id,
    sale_id: r.saleId,
    type: r.type,
    weight: r.weight,
    pcs: r.pcs,
    created_at: r.createdAt,
  };
}

function toRemoteEditHistory(r: typeof rowEditHistory.$inferSelect) {
  return {
    id: r.id,
    row_id: r.rowId,
    previous_weight: r.previousWeight,
    previous_pcs: r.previousPcs,
    new_weight: r.newWeight,
    new_pcs: r.newPcs,
    reason: r.reason,
    created_at: r.createdAt,
  };
}

function toRemoteRow(table: SyncedTable, row: Record<string, unknown>): Record<string, unknown> {
  switch (table) {
    case "users":
      return toRemoteUser(row as typeof users.$inferSelect);
    case "user_prefs":
      return toRemoteUserPrefs(row as typeof userPrefs.$inferSelect);
    case "batches":
      return toRemoteBatch(row as typeof batches.$inferSelect);
    case "sales":
      return toRemoteSale(row as typeof sales.$inferSelect);
    case "sale_meta_data":
      return toRemoteSaleMeta(row as typeof saleMetaData.$inferSelect);
    case "measurement_rows":
      return toRemoteMeasurementRow(row as typeof measurementRows.$inferSelect);
    case "row_edit_history":
      return toRemoteEditHistory(row as typeof rowEditHistory.$inferSelect);
  }
}

async function pushUpsert(supabase: SupabaseClient, table: SyncedTable, id: string): Promise<boolean> {
  const row = await readCurrentRow(table, id);
  if (!row) return true; // deleted locally before flush ran — nothing to push
  const remoteRow = toRemoteRow(table, row);
  const { error } = await supabase.from(table).upsert([remoteRow], { onConflict: PK_COLUMN[table] });
  return !error;
}

async function pushDelete(supabase: SupabaseClient, table: SyncedTable, id: string): Promise<boolean> {
  const { error } = await supabase.from(table).delete().eq(PK_COLUMN[table], id);
  return !error;
}

export async function flushBackupQueue(supabase: SupabaseClient): Promise<void> {
  const queued = await db.select().from(dataBackupQueue);
  if (!queued.length) return;

  const byTable = new Map<SyncedTable, typeof queued>();
  for (const row of queued) {
    const table = row.tableName as SyncedTable;
    const list = byTable.get(table) ?? [];
    list.push(row);
    byTable.set(table, list);
  }

  const synced: { tableName: string; rowId: string }[] = [];

  // Upserts parent-first, deletes child-first — both respect the FK chain
  // the Supabase mirror shares with the local schema (see Task 3).
  for (const table of SYNCED_TABLES) {
    for (const q of (byTable.get(table) ?? []).filter((q) => q.op === "upsert")) {
      if (await pushUpsert(supabase, table, q.rowId)) {
        synced.push({ tableName: q.tableName, rowId: q.rowId });
      }
    }
  }
  for (const table of [...SYNCED_TABLES].reverse()) {
    for (const q of (byTable.get(table) ?? []).filter((q) => q.op === "delete")) {
      if (await pushDelete(supabase, table, q.rowId)) {
        synced.push({ tableName: q.tableName, rowId: q.rowId });
      }
    }
  }

  for (const s of synced) {
    await db
      .delete(dataBackupQueue)
      .where(and(eq(dataBackupQueue.tableName, s.tableName), eq(dataBackupQueue.rowId, s.rowId)));
  }
}
