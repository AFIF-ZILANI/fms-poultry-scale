import { db } from "../db/client";
import { users, sales, batches, measurementRows, dataBackupQueue } from "../db/schema";
import { applyMigrations, resetDb } from "./helpers/db";
import { restoreIfEmpty } from "../lib/backupSync/restore";
import type { SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

beforeAll(() => applyMigrations());
beforeEach(() => {
  resetDb();
  (AsyncStorage as unknown as { __resetStore: () => void }).__resetStore();
});

// failures maps a table name to the error PostgREST would report for it —
// note it reports errors in `error`, it does not throw. inCalls records the
// id lists handed to .in() so chunking is observable.
function fakeSupabase(
  rows: Record<string, any[]>,
  failures: Record<string, string> = {},
) {
  const inCalls: { table: string; ids: string[] }[] = [];
  const client = {
    from(table: string) {
      const all = rows[table] ?? [];
      let selected = all;
      const result = () =>
        failures[table]
          ? { data: null, error: { message: failures[table] } }
          : { data: selected, error: null };
      const builder: any = {
        select: () => builder,
        eq: (_col: string, _val: string) => builder,
        in: (col: string, vals: string[]) => {
          inCalls.push({ table, ids: vals });
          selected = all.filter((r) => vals.includes(r[col]));
          return builder;
        },
        maybeSingle: async () => {
          const r = result();
          return r.error ? r : { data: selected[0] ?? null, error: null };
        },
        then: (resolve: any) => resolve(result()),
      };
      return builder;
    },
  };
  return { supabase: client as unknown as SupabaseClient, inCalls };
}

// Most tests only need the client.
function fakeClient(rows: Record<string, any[]>, failures?: Record<string, string>) {
  return fakeSupabase(rows, failures).supabase;
}

const KEY = "backup-restore-checked:u1";

const remoteUser = {
  id: "u1", name: "Farmer A", phone: null, email: null, location: null,
  farm_name: null, is_onboarded: true, business_name: null, role: "farmer",
  subscription_plan: "community", farm_capacity: null, buying_capacity: null,
  breed: null, supply_regions: null, created_at: "2026-01-01T00:00:00Z",
};
const remoteBatch = {
  id: "b1", user_id: "u1", name: "Shed 1", closed_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};
const remoteSale = {
  id: "s1", user_id: "u1", batch_id: "b1", phase: "main",
  is_pcs_tracked: true, has_cull: false, is_finished: true,
  created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
};

describe("restoreIfEmpty", () => {
  it("does nothing if local data already exists", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.insert(batches).values({
      id: "b1", userId: "u1", name: "Shed 1",
      createdAt: new Date(), updatedAt: new Date(),
    });
    await db.insert(sales).values({
      id: "s1", userId: "u1", phase: "main", isPcsTracked: true,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const supabase = fakeClient({
      users: [{ id: "u1", name: "Remote Name", is_onboarded: true, role: "farmer", subscription_plan: "community", created_at: "2026-01-01T00:00:00Z" }],
    });
    await restoreIfEmpty("u1", supabase);

    const local = await db.select().from(sales);
    expect(local).toHaveLength(1);
  });

  it("does nothing when the remote account has no data either", async () => {
    const supabase = fakeClient({ users: [] });
    await restoreIfEmpty("u1", supabase);
    expect(await db.select().from(sales)).toHaveLength(0);
  });

  it("pulls down a remote user, batch, sale and meta into the empty local DB", async () => {
    const supabase = fakeClient({
      users: [{
        id: "u1", name: "Farmer A", phone: null, email: null, location: null,
        farm_name: null, is_onboarded: true, business_name: null, role: "farmer",
        subscription_plan: "community", farm_capacity: null, buying_capacity: null,
        breed: null, supply_regions: null, created_at: "2026-01-01T00:00:00Z",
      }],
      user_prefs: [],
      batches: [{
        id: "b1", user_id: "u1", name: "Shed 1", closed_at: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
      sales: [{
        id: "s1", user_id: "u1", batch_id: "b1", phase: "main",
        is_pcs_tracked: true, has_cull: false, is_finished: true,
        created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
      }],
      sale_meta_data: [{
        sale_id: "s1", main_weight_kg: 10, main_pcs: 5, buyer_name: null,
        kg_per_crate: 2, deduction_per_crate_g: 200, is_full_crates_only: false,
        main_price: 100, main_amount: 900, cull_weight_kg: 0, is_cull_sold: null,
        cull_sale_type: null, cull_price: null, cull_pcs: null, cull_amount: null,
        final_amount: 900, received_amount: 900, total_deduction_wt_kg: 1,
        avg_wt_grams: null, net_weight_kg: 9, total_crates: 5, total_pcs: 5,
        created_at: "2026-01-02T00:00:00Z",
      }],
      measurement_rows: [],
      row_edit_history: [],
    });

    await restoreIfEmpty("u1", supabase);

    const [restoredBatch] = await db.select().from(batches);
    expect(restoredBatch.name).toBe("Shed 1");
    const [restoredSale] = await db.select().from(sales);
    expect(restoredSale.id).toBe("s1");
    expect(restoredSale.createdAt).toBeInstanceOf(Date);
    // The insert triggers (Task 2) fire on these restored rows too — the
    // queue they land in must be cleared, or restore would immediately
    // push back data that's already on Supabase.
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("does not re-restore once the one-time flag is set, even if sales is empty", async () => {
    await AsyncStorage.setItem(KEY, "done");
    const supabase = fakeClient({
      users: [{
        id: "u1", name: "Remote Name", is_onboarded: true, role: "farmer",
        subscription_plan: "community", created_at: "2026-01-01T00:00:00Z",
      }],
      batches: [{
        id: "b1", user_id: "u1", name: "Shed 1", closed_at: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
    });

    await restoreIfEmpty("u1", supabase);

    // This is the resurrection scenario: sales is empty (as it would be
    // right after a locally-deleted, not-yet-flushed sale), but the flag
    // being set means "already resolved for this install" — restore must
    // not run again and pull anything back down.
    expect(await db.select().from(sales)).toHaveLength(0);
    expect(await db.select().from(batches)).toHaveLength(0);
  });

  it("sets the one-time flag after resolving, even when there was nothing to restore", async () => {
    const supabase = fakeClient({ users: [] });
    await restoreIfEmpty("u1", supabase);
    expect(await AsyncStorage.getItem(KEY)).toBe("done");
  });

  // ─── Finding 1: a Supabase error must abort and stay retryable ───

  it("throws instead of silently skipping a table whose request failed", async () => {
    const supabase = fakeClient(
      { users: [remoteUser] },
      { batches: "network down" },
    );

    await expect(restoreIfEmpty("u1", supabase)).rejects.toThrow(/batches/);
  });

  it("does not mark the restore done when it failed partway", async () => {
    const supabase = fakeClient({ users: [remoteUser] }, { batches: "network down" });

    await expect(restoreIfEmpty("u1", supabase)).rejects.toThrow();

    expect(await AsyncStorage.getItem(KEY)).not.toBe("done");
  });

  it("retries and completes on the next launch after a partial restore", async () => {
    const rows = {
      users: [remoteUser],
      user_prefs: [],
      batches: [remoteBatch],
      sales: [remoteSale],
      sale_meta_data: [],
      measurement_rows: [],
      row_edit_history: [],
    };
    // First launch: batches lands, sales blows up.
    await expect(
      restoreIfEmpty("u1", fakeClient(rows, { sales: "network down" })),
    ).rejects.toThrow();
    expect(await db.select().from(batches)).toHaveLength(1);
    expect(await db.select().from(sales)).toHaveLength(0);

    // Second launch: local DB is no longer empty, but the interrupted
    // restore must resume rather than call it done.
    await restoreIfEmpty("u1", fakeClient(rows));

    expect(await db.select().from(sales)).toHaveLength(1);
    expect(await db.select().from(batches)).toHaveLength(1); // not duplicated
    expect(await AsyncStorage.getItem(KEY)).toBe("done");
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("clears only its own queue entries, not local writes made before the retry", async () => {
    // The window the three-state flag opens: an earlier attempt failed, the
    // user kept working offline, and those writes are queued. This run's
    // cleanup must take its own restored rows and leave the rest alone.
    await AsyncStorage.setItem(KEY, "restoring");
    await db.insert(dataBackupQueue).values({
      tableName: "sales", rowId: "local-sale", op: "upsert", queuedAt: new Date(1000),
    });

    await restoreIfEmpty("u1", fakeClient({
      users: [remoteUser], user_prefs: [], batches: [remoteBatch],
      sales: [remoteSale], sale_meta_data: [], measurement_rows: [],
      row_edit_history: [],
    }));

    const queue = await db.select().from(dataBackupQueue);
    expect(queue.map((q) => [q.tableName, q.rowId])).toEqual([["sales", "local-sale"]]);
  });

  // ─── Finding 5: `.in()` lists are chunked ───

  it("chunks the sale_id and row_id lookups instead of one giant .in()", async () => {
    const manySales = Array.from({ length: 450 }, (_, i) => ({
      ...remoteSale, id: `s${i}`, batch_id: null,
    }));
    const manyRows = manySales.map((s, i) => ({
      id: `m${i}`, sale_id: s.id, type: "main", weight: 1, pcs: null,
      created_at: "2026-01-02T00:00:00Z",
    }));
    const { supabase, inCalls } = fakeSupabase({
      users: [remoteUser], user_prefs: [], batches: [], sales: manySales,
      sale_meta_data: [], measurement_rows: manyRows, row_edit_history: [],
    });

    await restoreIfEmpty("u1", supabase);

    expect(inCalls.filter((c) => c.table === "measurement_rows").map((c) => c.ids.length))
      .toEqual([200, 200, 50]);
    expect(inCalls.filter((c) => c.table === "row_edit_history").map((c) => c.ids.length))
      .toEqual([200, 200, 50]);
    // Chunked results are aggregated, not just the last chunk's.
    expect(await db.select().from(measurementRows)).toHaveLength(450);
  });

  // ─── Finding 6: the flag is per user, not global ───

  it("still restores for a second account signing in on the same device", async () => {
    await restoreIfEmpty("u1", fakeClient({ users: [remoteUser] }));
    expect(await AsyncStorage.getItem(KEY)).toBe("done");

    const otherUser = { ...remoteUser, id: "u2", name: "Farmer B" };
    await restoreIfEmpty("u2", fakeClient({
      users: [otherUser], user_prefs: [], batches: [{ ...remoteBatch, user_id: "u2" }],
      sales: [], sale_meta_data: [], measurement_rows: [], row_edit_history: [],
    }));

    const local = await db.select().from(users);
    expect(local.map((u) => u.id).sort()).toEqual(["u1", "u2"]);
    expect(await db.select().from(batches)).toHaveLength(1);
    expect(await AsyncStorage.getItem("backup-restore-checked:u2")).toBe("done");
  });
});
