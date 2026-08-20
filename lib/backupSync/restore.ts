import { and, eq } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { chunked, type SyncedTable } from "./tables";

// Per user, not one global key: signing a second Clerk account into the same
// device must not inherit the first account's "already resolved" answer.
function restoreStateKey(userId: string): string {
  return `backup-restore-checked:${userId}`;
}

// PostgREST reports a failed request in `error` and leaves `data` null — it
// does not throw. Discarding the error would make "the network dropped"
// indistinguishable from "this account has no rows", which is how a partial
// restore used to look like a complete one.
function unwrap<T>(res: { data: T; error: { message?: string } | null }, what: string): T {
  if (res.error) throw new Error(`backup restore: ${what} failed: ${res.error.message ?? "unknown error"}`);
  return res.data;
}

// PostgREST puts `.in()` lists in the request URL, so a user with a few
// thousand measurement rows would build a URL past the server's limit.
const IN_CHUNK = 200;

async function selectIn(
  supabase: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
): Promise<any[]> {
  const out: any[] = [];
  for (const group of chunked(ids, IN_CHUNK)) {
    out.push(...(unwrap(await supabase.from(table).select("*").in(column, group), table) ?? []));
  }
  return out;
}

function toDate(v: string | null): Date | null {
  return v === null || v === undefined ? null : new Date(v);
}

function fromRemoteUser(r: any): typeof users.$inferInsert {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    location: r.location,
    farmName: r.farm_name,
    is_onboarded: r.is_onboarded,
    businessName: r.business_name,
    role: r.role,
    subscriptionPlan: r.subscription_plan,
    farmCapacity: r.farm_capacity,
    buyingCapacity: r.buying_capacity,
    breed: r.breed,
    supplyRegions: r.supply_regions,
    createdAt: toDate(r.created_at) ?? new Date(),
  };
}

function fromRemoteUserPrefs(r: any): typeof userPrefs.$inferInsert {
  return {
    userId: r.user_id,
    language: r.language,
    theme: r.theme,
    logGroupSize: r.log_group_size,
    kgPerCrate: r.kg_per_crate,
    deductionWtG: r.deduction_wt_g,
    priceKg: r.price_kg,
  };
}

function fromRemoteBatch(r: any): typeof batches.$inferInsert {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    closedAt: toDate(r.closed_at),
    createdAt: toDate(r.created_at) ?? new Date(),
    updatedAt: toDate(r.updated_at) ?? new Date(),
  };
}

function fromRemoteSale(r: any): typeof sales.$inferInsert {
  return {
    id: r.id,
    userId: r.user_id,
    batchId: r.batch_id,
    phase: r.phase,
    isPcsTracked: r.is_pcs_tracked,
    hasCull: r.has_cull,
    isFinished: r.is_finished,
    createdAt: toDate(r.created_at) ?? new Date(),
    updatedAt: toDate(r.updated_at) ?? new Date(),
  };
}

function fromRemoteSaleMeta(r: any): typeof saleMetaData.$inferInsert {
  return {
    saleId: r.sale_id,
    mainWeightKg: r.main_weight_kg,
    mainPcs: r.main_pcs,
    buyerName: r.buyer_name,
    kgPerCrate: r.kg_per_crate,
    deductionPerCrateG: r.deduction_per_crate_g,
    isFullCratesOnly: r.is_full_crates_only,
    mainPrice: r.main_price,
    mainAmount: r.main_amount,
    cullWeightKg: r.cull_weight_kg,
    isCullSold: r.is_cull_sold,
    cullSaleType: r.cull_sale_type,
    cullPrice: r.cull_price,
    cullPcs: r.cull_pcs,
    cullAmount: r.cull_amount,
    finalAmount: r.final_amount,
    receivedAmount: r.received_amount,
    totalDeductionWtKg: r.total_deduction_wt_kg,
    avgWtGrams: r.avg_wt_grams,
    netWeightKg: r.net_weight_kg,
    totalCrates: r.total_crates,
    totalPcs: r.total_pcs,
    createdAt: toDate(r.created_at) ?? new Date(),
  };
}

function fromRemoteMeasurementRow(r: any): typeof measurementRows.$inferInsert {
  return {
    id: r.id,
    saleId: r.sale_id,
    type: r.type,
    weight: r.weight,
    pcs: r.pcs,
    createdAt: toDate(r.created_at) ?? new Date(),
  };
}

function fromRemoteEditHistory(r: any): typeof rowEditHistory.$inferInsert {
  return {
    id: r.id,
    rowId: r.row_id,
    previousWeight: r.previous_weight,
    previousPcs: r.previous_pcs,
    newWeight: r.new_weight,
    newPcs: r.new_pcs,
    reason: r.reason,
    createdAt: toDate(r.created_at) ?? new Date(),
  };
}

// Gated by a persisted per-user flag, not a live "is sales empty" check: a
// user can legitimately empty their local sales table through normal use
// (deleting their last sale). If that delete's queue entry hasn't flushed
// to Supabase yet, a bare emptiness check can't tell that apart from a
// fresh install — it would pull the not-yet-deleted row back down and then
// clear the very queue entry that would have propagated the delete,
// permanently reviving data the user removed. The flag makes this run its
// restore-or-not decision exactly once per local install; a genuine
// reinstall/new device has no AsyncStorage data either, so restore still
// fires correctly there.
//
// The flag has three states, not two: "done" (resolved, never runs again)
// and "restoring" (a restore started but threw partway). "restoring" matters
// because a half-restored DB is no longer empty, so on the retry the
// emptiness check would otherwise conclude "not a fresh install" and mark
// the partial restore done forever. Every insert is onConflictDoNothing, so
// re-running a partly applied restore just skips what already landed.
//
// Any Supabase error throws and leaves the flag unset (or at "restoring"),
// so the next app launch retries instead of living with a silently partial
// recovery. The caller (schedule.ts) catches it.
//
// Insert order is parent-first, same order the flush upserts use — a
// child row's FK must already exist locally before the child is inserted.
export async function restoreIfEmpty(userId: string, supabase: SupabaseClient): Promise<void> {
  const key = restoreStateKey(userId);
  const state = await AsyncStorage.getItem(key);
  if (state === "done") return; // already resolved for this install + account

  if (state !== "restoring") {
    const hasLocalData = await db.select().from(sales).limit(1).get();
    if (hasLocalData) {
      // not a fresh install/device — never overwrite live local data
      await AsyncStorage.setItem(key, "done");
      return;
    }
  }

  const remoteUser = unwrap(
    await supabase.from("users").select("*").eq("id", userId).maybeSingle(),
    "users",
  );
  if (!remoteUser) {
    await AsyncStorage.setItem(key, "done"); // genuinely new account, nothing to restore
    return;
  }

  // Marked before the first local write, so a throw anywhere below leaves
  // this recognisable as an interrupted restore rather than a fresh start.
  await AsyncStorage.setItem(key, "restoring");

  // The (table, row_id) pairs this restore pulls down, so the cleanup at the
  // end can clear exactly their queue entries and nothing else. The id read
  // off each remote row is that table's PK — the same column the queue
  // triggers write into row_id (see PK_COLUMN in ./tables).
  const restored: { table: SyncedTable; rowId: string }[] = [];
  const track = (table: SyncedTable, ids: string[]) => {
    for (const rowId of ids) restored.push({ table, rowId });
  };

  await db.insert(users).values(fromRemoteUser(remoteUser)).onConflictDoNothing();
  track("users", [remoteUser.id]);

  const prefs = unwrap(await supabase.from("user_prefs").select("*").eq("user_id", userId), "user_prefs");
  if (prefs?.length) {
    await db.insert(userPrefs).values(prefs.map(fromRemoteUserPrefs)).onConflictDoNothing();
    track("user_prefs", prefs.map((p: any) => p.user_id));
  }

  const remoteBatches = unwrap(await supabase.from("batches").select("*").eq("user_id", userId), "batches");
  if (remoteBatches?.length) {
    await db.insert(batches).values(remoteBatches.map(fromRemoteBatch)).onConflictDoNothing();
    track("batches", remoteBatches.map((b: any) => b.id));
  }

  const remoteSales = unwrap(await supabase.from("sales").select("*").eq("user_id", userId), "sales");
  if (remoteSales?.length) {
    await db.insert(sales).values(remoteSales.map(fromRemoteSale)).onConflictDoNothing();
  }

  const saleIds: string[] = (remoteSales ?? []).map((s: any) => s.id);
  track("sales", saleIds);
  if (saleIds.length) {
    const meta = await selectIn(supabase, "sale_meta_data", "sale_id", saleIds);
    if (meta.length) {
      await db.insert(saleMetaData).values(meta.map(fromRemoteSaleMeta)).onConflictDoNothing();
      track("sale_meta_data", meta.map((m: any) => m.sale_id));
    }

    const rows = await selectIn(supabase, "measurement_rows", "sale_id", saleIds);
    if (rows.length) {
      await db.insert(measurementRows).values(rows.map(fromRemoteMeasurementRow)).onConflictDoNothing();
    }

    const rowIds: string[] = rows.map((r: any) => r.id);
    track("measurement_rows", rowIds);
    if (rowIds.length) {
      const history = await selectIn(supabase, "row_edit_history", "row_id", rowIds);
      if (history.length) {
        await db.insert(rowEditHistory).values(history.map(fromRemoteEditHistory)).onConflictDoNothing();
        track("row_edit_history", history.map((h: any) => h.id));
      }
    }
  }

  // The restored rows are already identical to what's on Supabase, but the
  // insert triggers from Task 2 fired anyway and queued them as dirty —
  // clear that so restore doesn't cause an immediate, redundant push.
  //
  // Only those rows, never the whole table: an interrupted restore can be
  // retried launches later, and the user's own offline writes made in the
  // meantime are sitting in the same queue. Wiping it would drop them
  // silently (same precision fix as clearQueueEntries in ./flush).
  //
  // ponytail: a row this restore pulled down *and* the user edited between an
  // interrupted attempt and this retry still loses that edit's queue entry —
  // the pair alone can't tell the two apart. Match on queuedAt (as flush
  // does) if that window ever shows up in practice.
  for (const r of restored) {
    await db.delete(dataBackupQueue).where(
      and(eq(dataBackupQueue.tableName, r.table), eq(dataBackupQueue.rowId, r.rowId)),
    );
  }

  await AsyncStorage.setItem(key, "done");
}
