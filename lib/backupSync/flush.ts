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

async function pushUpsert(supabase: SupabaseClient, table: SyncedTable, id: string): Promise<boolean> {
  const row = await readCurrentRow(table, id);
  if (!row) return true; // deleted locally before flush ran — nothing to push
  const { error } = await supabase.from(table).upsert([row], { onConflict: PK_COLUMN[table] });
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
