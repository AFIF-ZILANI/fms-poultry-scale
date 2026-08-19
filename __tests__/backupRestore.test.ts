import { db } from "../db/client";
import { users, sales, batches } from "../db/schema";
import { applyMigrations, resetDb } from "./helpers/db";
import { restoreIfEmpty } from "../lib/backupSync/restore";
import type { SupabaseClient } from "@supabase/supabase-js";

beforeAll(() => applyMigrations());
beforeEach(() => resetDb());

function fakeSupabase(rows: Record<string, any[]>) {
  const client = {
    from(table: string) {
      const data = rows[table] ?? [];
      const builder: any = {
        select: () => builder,
        eq: (_col: string, _val: string) => builder,
        in: (_col: string, _vals: string[]) => builder,
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        then: (resolve: any) => resolve({ data, error: null }),
      };
      return builder;
    },
  };
  return client as unknown as SupabaseClient;
}

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

    const supabase = fakeSupabase({
      users: [{ id: "u1", name: "Remote Name", is_onboarded: true, role: "farmer", subscription_plan: "community", created_at: "2026-01-01T00:00:00Z" }],
    });
    await restoreIfEmpty("u1", supabase);

    const local = await db.select().from(sales);
    expect(local).toHaveLength(1);
  });

  it("does nothing when the remote account has no data either", async () => {
    const supabase = fakeSupabase({ users: [] });
    await restoreIfEmpty("u1", supabase);
    expect(await db.select().from(sales)).toHaveLength(0);
  });

  it("pulls down a remote user, batch, sale and meta into the empty local DB", async () => {
    const supabase = fakeSupabase({
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
  });
});
