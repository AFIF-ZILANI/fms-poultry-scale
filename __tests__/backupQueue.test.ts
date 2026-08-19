import { db } from "../db/client";
import {
  users, userPrefs, batches, sales, saleMetaData, measurementRows,
  rowEditHistory, dataBackupQueue,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { applyMigration, applyMigrations, resetDb } from "./helpers/db";

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

// Finding 2: the triggers only see future writes. Every device already in
// the field has rows that predate migration 0012, and a finished sale is
// never edited again — without the backfill those rows would never sync.
describe("backup queue backfill (migration 0013)", () => {
  async function seedPreExistingData() {
    await db.insert(users).values({ id: "u1" });
    await db.insert(userPrefs).values({ userId: "u1" });
    await db.insert(batches).values({
      id: "b1", userId: "u1", name: "Shed 1",
      createdAt: new Date(), updatedAt: new Date(),
    });
    await db.insert(sales).values({
      id: "s1", userId: "u1", batchId: "b1", phase: "main", isPcsTracked: true,
      createdAt: new Date(), updatedAt: new Date(),
    });
    await db.insert(saleMetaData).values({
      saleId: "s1", mainWeightKg: 10, kgPerCrate: 2, deductionPerCrateG: 200,
      isFullCratesOnly: false, mainPrice: 100, mainAmount: 900, finalAmount: 900,
      receivedAmount: 900, totalDeductionWtKg: 1, netWeightKg: 9, totalCrates: 5,
      createdAt: new Date(),
    });
    await db.insert(measurementRows).values({
      id: "m1", saleId: "s1", type: "main", weight: 2, createdAt: new Date(),
    });
    await db.insert(rowEditHistory).values({
      id: "h1", rowId: "m1", previousWeight: 1, newWeight: 2, createdAt: new Date(),
    });
    // Pretend the rows predate the triggers: drop what the triggers just
    // queued, so only the backfill can put them back.
    await db.delete(dataBackupQueue);
  }

  it("queues every pre-existing row in every synced table", async () => {
    await seedPreExistingData();

    applyMigration("0013_backup_queue_backfill");

    const queued = await db.select().from(dataBackupQueue);
    expect(queued.every((q) => q.op === "upsert")).toBe(true);
    expect(queued.map((q) => `${q.tableName}:${q.rowId}`).sort()).toEqual([
      "batches:b1",
      "measurement_rows:m1",
      "row_edit_history:h1",
      "sale_meta_data:s1",
      "sales:s1",
      "user_prefs:u1",
      "users:u1",
    ]);
  });

  it("does not overwrite a pending delete already queued by a trigger", async () => {
    await seedPreExistingData();
    await db.delete(rowEditHistory).where(eq(rowEditHistory.id, "h1"));

    applyMigration("0013_backup_queue_backfill");

    expect((await queueRow("row_edit_history", "h1"))?.op).toBe("delete");
  });
});
