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
function buildFakeBackupFile(): string {
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

  it("cleans up the temp download file and detaches even if an insert fails partway through", async () => {
    // Pre-existing local row collides with the backup's own "u1" row,
    // forcing the very first INSERT (users, first in TABLES_IN_ORDER) to
    // violate the primary key constraint.
    await db.insert(users).values({ id: "u1" });
    mockDownloadAsCopyOf(buildFakeBackupFile());

    await expect(restoreFromDrive(getAccessToken, "backup-file-id")).rejects.toThrow();

    const info = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}drive-restore-temp.db`);
    expect(info.exists).toBe(false);
  });
});
