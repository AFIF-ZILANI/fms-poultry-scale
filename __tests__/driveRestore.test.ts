import { db } from "../db/client";
import { users, batches, sales, dataBackupQueue } from "../db/schema";
import { applyMigrations, resetDb } from "./helpers/db";
import { checkForRestorableBackup, restoreFromDrive } from "../lib/driveSync/restore";
import * as driveApi from "../lib/driveSync/driveApi";
import * as FileSystem from "expo-file-system/legacy";
import fs from "fs";
import path from "path";
import os from "os";
import { DatabaseSync } from "node:sqlite";

beforeAll(() => applyMigrations());
beforeEach(() => {
  resetDb();
  jest.restoreAllMocks();
});

const getAccessToken = async () => "fake-token";

// Stands in for a real downloaded Drive backup: a standalone SQLite file
// built by applying the same migrations a real device's backup would have
// gone through (via node:sqlite directly, not through the app's `db`,
// since this has to be a genuinely separate file to attach to it).
function buildFakeBackupFile(mutate?: (source: InstanceType<typeof DatabaseSync>) => void): string {
  const migrationsDir = path.join(__dirname, "../db/migrations");
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8"),
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-drive-backup-"));
  const filePath = path.join(dir, "backup.db");
  const source = new DatabaseSync(filePath);
  for (const entry of journal.entries) {
    const sql = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) source.exec(stmt);
    }
  }
  mutate?.(source);
  source.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Restored Farmer');`);
  source.exec(
    `INSERT INTO batches (id, user_id, name, created_at, updated_at) VALUES ('b1', 'u1', 'Shed 1', 0, 0);`,
  );
  source.close();
  return filePath;
}

function mockDownloadAsCopyOf(sourcePath: string) {
  jest.spyOn(FileSystem, "downloadAsync").mockImplementation(async (_url: string, destUri: string) => {
    fs.copyFileSync(sourcePath, destUri.replace("file://", ""));
    return { uri: destUri } as any;
  });
}

describe("checkForRestorableBackup", () => {
  it("returns null when local data already exists", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.insert(sales).values({
      id: "s1", userId: "u1", phase: "main", isPcsTracked: true,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const findSpy = jest.spyOn(driveApi, "findBackupFile");

    expect(await checkForRestorableBackup(getAccessToken)).toBeNull();
    expect(findSpy).not.toHaveBeenCalled(); // never even asks Drive
  });

  it("returns null when local data is empty but Drive has no backup", async () => {
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    expect(await checkForRestorableBackup(getAccessToken)).toBeNull();
  });

  it("returns the file id when local data is empty and Drive has a backup", async () => {
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue("backup-file-id");
    expect(await checkForRestorableBackup(getAccessToken)).toEqual({ fileId: "backup-file-id" });
  });
});

describe("restoreFromDrive", () => {
  it("attaches the downloaded file, imports its rows, and clears the local queue", async () => {
    mockDownloadAsCopyOf(buildFakeBackupFile());

    await restoreFromDrive(getAccessToken, "backup-file-id");

    const [restoredUser] = await db.select().from(users);
    expect(restoredUser.name).toBe("Restored Farmer");
    const [restoredBatch] = await db.select().from(batches);
    expect(restoredBatch.name).toBe("Shed 1");
    // The INSERTs above fire the same triggers a normal write would —
    // clearing the queue afterward is what stops that from immediately
    // re-triggering a pointless backup of data that's already on Drive.
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("does not leave the temp download file behind", async () => {
    mockDownloadAsCopyOf(buildFakeBackupFile());

    await restoreFromDrive(getAccessToken, "backup-file-id");

    const info = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}drive-restore-temp.db`);
    expect(info.exists).toBe(false);
  });

  // A backup row that main's foreign keys reject: `sales` is table 4 of 7,
  // so users/user_prefs/batches have already been inserted by the time it
  // blows up. FKs are switched off in the backup file only long enough to
  // plant the bad row — the real-world equivalent is a corrupt download.
  function backupWithABadSaleRow() {
    return buildFakeBackupFile((source) => {
      source.exec("PRAGMA foreign_keys = OFF;");
      source.exec(
        `INSERT INTO sales (id, user_id, phase, is_pcs_tracked, created_at, updated_at)
         VALUES ('s-bad', 'ghost-user', 'main', 1, 0, 0);`,
      );
    });
  }

  it("cleans up the temp download file and detaches even if an insert fails partway through", async () => {
    mockDownloadAsCopyOf(backupWithABadSaleRow());

    await expect(restoreFromDrive(getAccessToken, "backup-file-id")).rejects.toThrow();

    const info = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}drive-restore-temp.db`);
    expect(info.exists).toBe(false);
    // The connection is usable again — a still-attached backup db or an
    // open transaction would break every query after this.
    expect(await db.select().from(users)).toHaveLength(0);
  });

  // Finding 3a: without a transaction, tables 1-3 stay committed forever and
  // checkForRestorableBackup never offers a retry, since `sales` is empty but
  // `users` is not... and the user's own pre-restore rows are gone too.
  it("rolls the whole restore back when one table fails, leaving pre-restore state intact", async () => {
    await db.insert(users).values({ id: "local-u", name: "Local Farmer" });
    await db.insert(batches).values({
      id: "local-b", userId: "local-u", name: "Local Shed",
      createdAt: new Date(), updatedAt: new Date(),
    });
    mockDownloadAsCopyOf(backupWithABadSaleRow());

    await expect(restoreFromDrive(getAccessToken, "backup-file-id")).rejects.toThrow();

    expect((await db.select().from(users)).map((u) => u.name)).toEqual(["Local Farmer"]);
    expect((await db.select().from(batches)).map((b) => b.name)).toEqual(["Local Shed"]);
    expect(await db.select().from(sales)).toHaveLength(0);
  });

  // Finding 3b: onboarding writes a `users` row before any sale exists, and
  // checkForRestorableBackup only looks at `sales` — so a colliding local
  // row is the normal case, not an edge case.
  it("overwrites a colliding local row instead of failing on its primary key", async () => {
    await db.insert(users).values({ id: "u1", name: "Half-onboarded" });
    mockDownloadAsCopyOf(buildFakeBackupFile());

    await restoreFromDrive(getAccessToken, "backup-file-id");

    expect((await db.select().from(users)).map((u) => u.name)).toEqual(["Restored Farmer"]);
    expect((await db.select().from(batches)).map((b) => b.name)).toEqual(["Shed 1"]);
  });

  // Finding 6: `SELECT *` tied every backup to the schema version that wrote
  // it, so the next migration to touch a synced table would strand every
  // backup already sitting on Drive.
  it("restores across schema drift, using only the columns both schemas share", async () => {
    mockDownloadAsCopyOf(
      buildFakeBackupFile((source) => {
        // Backup predates a column main has now...
        source.exec("ALTER TABLE users DROP COLUMN supply_regions;");
        // ...and carries one main has since dropped.
        source.exec("ALTER TABLE batches ADD COLUMN legacy_note TEXT;");
      }),
    );

    await restoreFromDrive(getAccessToken, "backup-file-id");

    const [restoredUser] = await db.select().from(users);
    expect(restoredUser.name).toBe("Restored Farmer");
    expect(restoredUser.supplyRegions).toBeNull(); // main's default, not a crash
    expect((await db.select().from(batches)).map((b) => b.name)).toEqual(["Shed 1"]);
  });
});
