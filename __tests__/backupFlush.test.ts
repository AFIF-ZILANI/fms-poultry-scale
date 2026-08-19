import { db } from "../db/client";
import { users, batches, sales, measurementRows, dataBackupQueue } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { applyMigrations, resetDb } from "./helpers/db";
import { flushBackupQueue } from "../lib/backupSync/flush";
import type { SupabaseClient } from "@supabase/supabase-js";

beforeAll(() => applyMigrations());
beforeEach(() => resetDb());

// onUpsert lets a test act *during* the round trip, the way a user editing a
// row while a flush is in flight does.
function fakeSupabase(onUpsert?: (table: string, rows: any[]) => Promise<void>) {
  const upserts: { table: string; rows: any[] }[] = [];
  const deletes: { table: string; column: string; ids: string[] }[] = [];
  const client = {
    from(table: string) {
      return {
        upsert: async (rows: any[]) => {
          upserts.push({ table, rows });
          await onUpsert?.(table, rows);
          return { error: null };
        },
        delete: () => ({
          in: async (column: string, ids: string[]) => {
            deletes.push({ table, column, ids });
            return { error: null };
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, upserts, deletes };
}

async function seedSaleWithRows(count: number) {
  await db.insert(users).values({ id: "u1" });
  await db.insert(sales).values({
    id: "s1", userId: "u1", phase: "main", isPcsTracked: true,
    createdAt: new Date(), updatedAt: new Date(),
  });
  await db.insert(measurementRows).values(
    Array.from({ length: count }, (_, i) => ({
      id: `m${i}`, saleId: "s1", type: "main" as const, weight: 1, createdAt: new Date(),
    })),
  );
}

describe("flushBackupQueue", () => {
  it("does nothing when the queue is empty", async () => {
    const { client, upserts } = fakeSupabase();
    await flushBackupQueue(client);
    expect(upserts).toHaveLength(0);
  });

  it("pushes the current row state and clears the queue on success", async () => {
    await db.insert(users).values({ id: "u1", name: "Farmer A" });
    const { client, upserts } = fakeSupabase();

    await flushBackupQueue(client);

    expect(upserts).toEqual([
      { table: "users", rows: [expect.objectContaining({ id: "u1", name: "Farmer A" })] },
    ]);
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("collapses repeated edits into one push, reading the latest state", async () => {
    await db.insert(users).values({ id: "u1", name: "A" });
    await db.update(users).set({ name: "B" }).where(eq(users.id, "u1"));
    await db.update(users).set({ name: "C" }).where(eq(users.id, "u1"));
    const { client, upserts } = fakeSupabase();

    await flushBackupQueue(client);

    const userUpserts = upserts.filter((u) => u.table === "users");
    expect(userUpserts).toHaveLength(1);
    expect(userUpserts[0].rows[0].name).toBe("C");
  });

  it("pushes deletes and clears the queue", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.delete(users).where(eq(users.id, "u1"));
    const { client, deletes } = fakeSupabase();

    await flushBackupQueue(client);

    expect(deletes).toEqual([{ table: "users", column: "id", ids: ["u1"] }]);
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("leaves the queue entry in place when the push fails", async () => {
    await db.insert(users).values({ id: "u1" });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const failing = {
      from: () => ({
        upsert: async () => ({ error: { message: "network down" } }),
        delete: () => ({ in: async () => ({ error: { message: "network down" } }) }),
      }),
    } as unknown as SupabaseClient;

    await flushBackupQueue(failing);

    expect(await db.select().from(dataBackupQueue)).toHaveLength(1);
    // Finding 7: the actual error must reach a log, not vanish into a boolean.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("upsert into users failed"),
      { message: "network down" },
    );
    warn.mockRestore();
  });

  it("logs the underlying error when a delete fails", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.delete(users).where(eq(users.id, "u1"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const failing = {
      from: () => ({
        upsert: async () => ({ error: null }),
        delete: () => ({ in: async () => ({ error: { message: "rls denied" } }) }),
      }),
    } as unknown as SupabaseClient;

    await flushBackupQueue(failing);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("delete from users failed"),
      { message: "rls denied" },
    );
    expect(await db.select().from(dataBackupQueue)).toHaveLength(1);
    warn.mockRestore();
  });

  it("upserts parent tables before child tables in one flush", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.insert(batches).values({
      id: "b1", userId: "u1", name: "Shed 1",
      createdAt: new Date(), updatedAt: new Date(),
    });
    const order: string[] = [];
    const client = {
      from(table: string) {
        return {
          upsert: async () => { order.push(table); return { error: null }; },
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      },
    } as unknown as SupabaseClient;

    await flushBackupQueue(client);

    expect(order.indexOf("users")).toBeLessThan(order.indexOf("batches"));
  });

  it("maps camelCase local fields to snake_case remote columns", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.insert(batches).values({
      id: "b1", userId: "u1", name: "Shed 1",
      createdAt: new Date(), updatedAt: new Date(),
    });
    const { client, upserts } = fakeSupabase();

    await flushBackupQueue(client);

    const batchUpsert = upserts.find((u) => u.table === "batches");
    expect(batchUpsert?.rows[0]).toHaveProperty("user_id", "u1");
    expect(batchUpsert?.rows[0]).not.toHaveProperty("userId");
  });

  // ─── Finding 4: one request per table, not one per row ───

  it("sends a table's rows in a single upsert request, not one per row", async () => {
    await seedSaleWithRows(50);
    const { client, upserts } = fakeSupabase();

    await flushBackupQueue(client);

    const rowUpserts = upserts.filter((u) => u.table === "measurement_rows");
    expect(rowUpserts).toHaveLength(1);
    expect(rowUpserts[0].rows).toHaveLength(50);
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("chunks a table's rows so one request can't grow unbounded", async () => {
    await seedSaleWithRows(1200);
    const { client, upserts } = fakeSupabase();

    await flushBackupQueue(client);

    const rowUpserts = upserts.filter((u) => u.table === "measurement_rows");
    expect(rowUpserts.map((u) => u.rows.length)).toEqual([500, 500, 200]);
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("sends a table's deletes as one .in() request", async () => {
    await seedSaleWithRows(3);
    await db.delete(measurementRows).where(eq(measurementRows.saleId, "s1"));
    const { client, deletes } = fakeSupabase();

    await flushBackupQueue(client);

    const rowDeletes = deletes.filter((d) => d.table === "measurement_rows");
    expect(rowDeletes).toHaveLength(1);
    expect(rowDeletes[0].ids.sort()).toEqual(["m0", "m1", "m2"]);
  });

  it("retries a whole failed chunk without clearing any of its rows", async () => {
    await seedSaleWithRows(600);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let call = 0;
    const flaky = {
      from: (table: string) => ({
        upsert: async () => {
          if (table !== "measurement_rows") return { error: null };
          call += 1;
          return call === 1 ? { error: { message: "boom" } } : { error: null };
        },
        delete: () => ({ in: async () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;

    await flushBackupQueue(flaky);

    // First chunk (500) failed whole, second (100) landed — only the failed
    // chunk's rows are still queued, and none are half-cleared.
    const left = await db
      .select()
      .from(dataBackupQueue)
      .where(eq(dataBackupQueue.tableName, "measurement_rows"));
    expect(left).toHaveLength(500);
    warn.mockRestore();
  });

  // ─── Finding 3: an edit landing during the push must survive ───

  it("keeps a queue entry that was re-queued while its push was in flight", async () => {
    await db.insert(users).values({ id: "u1", name: "A" });
    const before = await db.select().from(dataBackupQueue).get();

    const { client, upserts } = fakeSupabase(async (table) => {
      if (table !== "users") return;
      // The user edits the row mid-round-trip. The trigger rewrites the queue
      // entry with a fresh queuedAt; strftime is whole seconds, so the test
      // writes a distinct one directly rather than sleeping a second.
      await db.update(users).set({ name: "B" }).where(eq(users.id, "u1"));
      await db
        .update(dataBackupQueue)
        .set({ queuedAt: new Date((before!.queuedAt.getTime() / 1000 + 5) * 1000) })
        .where(and(eq(dataBackupQueue.tableName, "users"), eq(dataBackupQueue.rowId, "u1")));
    });

    await flushBackupQueue(client);

    expect(upserts.find((u) => u.table === "users")?.rows[0].name).toBe("A");
    // The newer edit is still queued and reaches Supabase on the next flush.
    const stillQueued = await db.select().from(dataBackupQueue);
    expect(stillQueued).toHaveLength(1);
    expect(stillQueued[0].rowId).toBe("u1");

    const second = fakeSupabase();
    await flushBackupQueue(second.client);
    expect(second.upserts.find((u) => u.table === "users")?.rows[0].name).toBe("B");
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });
});
