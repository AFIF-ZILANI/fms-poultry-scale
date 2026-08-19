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

const RESTORE_CHECKED_KEY = "backup-restore-checked";

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

// Gated by a persisted one-time flag, not a live "is sales empty" check: a
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
// Insert order is parent-first, same order the flush upserts use — a
// child row's FK must already exist locally before the child is inserted.
export async function restoreIfEmpty(userId: string, supabase: SupabaseClient): Promise<void> {
  if (await AsyncStorage.getItem(RESTORE_CHECKED_KEY)) return; // already resolved for this install

  try {
    const hasLocalData = await db.select().from(sales).limit(1).get();
    if (hasLocalData) return; // not a fresh install/device — never overwrite live local data

    const { data: remoteUser } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
    if (!remoteUser) return; // genuinely new account, nothing to restore

    await db.insert(users).values(fromRemoteUser(remoteUser)).onConflictDoNothing();

    const { data: prefs } = await supabase.from("user_prefs").select("*").eq("user_id", userId);
    if (prefs?.length) {
      await db.insert(userPrefs).values(prefs.map(fromRemoteUserPrefs)).onConflictDoNothing();
    }

    const { data: remoteBatches } = await supabase.from("batches").select("*").eq("user_id", userId);
    if (remoteBatches?.length) {
      await db.insert(batches).values(remoteBatches.map(fromRemoteBatch)).onConflictDoNothing();
    }

    const { data: remoteSales } = await supabase.from("sales").select("*").eq("user_id", userId);
    if (remoteSales?.length) {
      await db.insert(sales).values(remoteSales.map(fromRemoteSale)).onConflictDoNothing();
    }

    const saleIds: string[] = (remoteSales ?? []).map((s: any) => s.id);
    if (saleIds.length) {
      const { data: meta } = await supabase.from("sale_meta_data").select("*").in("sale_id", saleIds);
      if (meta?.length) {
        await db.insert(saleMetaData).values(meta.map(fromRemoteSaleMeta)).onConflictDoNothing();
      }

      const { data: rows } = await supabase.from("measurement_rows").select("*").in("sale_id", saleIds);
      if (rows?.length) {
        await db.insert(measurementRows).values(rows.map(fromRemoteMeasurementRow)).onConflictDoNothing();
      }

      const rowIds: string[] = (rows ?? []).map((r: any) => r.id);
      if (rowIds.length) {
        const { data: history } = await supabase.from("row_edit_history").select("*").in("row_id", rowIds);
        if (history?.length) {
          await db.insert(rowEditHistory).values(history.map(fromRemoteEditHistory)).onConflictDoNothing();
        }
      }
    }

    // The restored rows are already identical to what's on Supabase, but the
    // insert triggers from Task 2 fired anyway and queued them as dirty —
    // clear that so restore doesn't cause an immediate, redundant push.
    await db.delete(dataBackupQueue);
  } finally {
    // Set exactly once per install regardless of which path above was
    // taken — already-had-local-data, remote-also-empty, or a full restore.
    await AsyncStorage.setItem(RESTORE_CHECKED_KEY, "true");
  }
}
