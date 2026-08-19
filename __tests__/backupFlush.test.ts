import { db } from "../db/client";
import { users, batches, dataBackupQueue } from "../db/schema";
import { eq } from "drizzle-orm";
import { applyMigrations, resetDb } from "./helpers/db";
import { flushBackupQueue } from "../lib/backupSync/flush";
import type { SupabaseClient } from "@supabase/supabase-js";

beforeAll(() => applyMigrations());
beforeEach(() => resetDb());

function fakeSupabase() {
  const upserts: { table: string; rows: any[] }[] = [];
  const deletes: { table: string; column: string; id: string }[] = [];
  const client = {
    from(table: string) {
      return {
        upsert: async (rows: any[]) => {
          upserts.push({ table, rows });
          return { error: null };
        },
        delete: () => ({
          eq: async (column: string, id: string) => {
            deletes.push({ table, column, id });
            return { error: null };
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, upserts, deletes };
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

    expect(deletes).toEqual([{ table: "users", column: "id", id: "u1" }]);
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("leaves the queue entry in place when the push fails", async () => {
    await db.insert(users).values({ id: "u1" });
    const failing = {
      from: () => ({
        upsert: async () => ({ error: { message: "network down" } }),
        delete: () => ({ eq: async () => ({ error: { message: "network down" } }) }),
      }),
    } as unknown as SupabaseClient;

    await flushBackupQueue(failing);

    expect(await db.select().from(dataBackupQueue)).toHaveLength(1);
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
});
