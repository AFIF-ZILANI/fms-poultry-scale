import { db } from "../db/client";
import { users, batches, dataBackupQueue } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { applyMigrations, resetDb } from "./helpers/db";

beforeAll(() => applyMigrations());
beforeEach(() => resetDb());

async function queueRow(table: string, rowId: string) {
  return db
    .select()
    .from(dataBackupQueue)
    .where(and(eq(dataBackupQueue.tableName, table), eq(dataBackupQueue.rowId, rowId)))
    .get();
}

describe("backup queue triggers", () => {
  it("queues an upsert on insert", async () => {
    await db.insert(users).values({ id: "u1" });
    const q = await queueRow("users", "u1");
    expect(q?.op).toBe("upsert");
  });

  it("collapses repeated edits to the same row into one queue entry", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.update(users).set({ name: "A" }).where(eq(users.id, "u1"));
    await db.update(users).set({ name: "B" }).where(eq(users.id, "u1"));
    await db.update(users).set({ name: "C" }).where(eq(users.id, "u1"));

    const all = await db.select().from(dataBackupQueue).where(eq(dataBackupQueue.tableName, "users"));
    expect(all).toHaveLength(1);
    expect(all[0].op).toBe("upsert");
  });

  it("queues a delete, overwriting a pending upsert for the same row", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.delete(users).where(eq(users.id, "u1"));

    const q = await queueRow("users", "u1");
    expect(q?.op).toBe("delete");
  });

  it("queues batches under their own table name with the row's id", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.insert(batches).values({
      id: "b1", userId: "u1", name: "Shed 1",
      createdAt: new Date(), updatedAt: new Date(),
    });

    const q = await queueRow("batches", "b1");
    expect(q?.op).toBe("upsert");
  });
});
