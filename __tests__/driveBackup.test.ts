import { db } from "../db/client";
import { users, dataBackupQueue } from "../db/schema";
import { applyMigrations, resetDb } from "./helpers/db";
import { runDriveBackup, getLastBackupAt, setRestorePending } from "../lib/driveSync/backup";
import * as driveApi from "../lib/driveSync/driveApi";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { eq } from "drizzle-orm";

beforeAll(() => applyMigrations());
beforeEach(() => {
  resetDb();
  (AsyncStorage as unknown as { __resetStore: () => void }).__resetStore();
  setRestorePending(false); // module-level guard: reset between tests
  jest.restoreAllMocks();
});

const getAccessToken = async () => "fake-token";
const USER = "user-a";

function notFound() {
  return Object.assign(new Error("Drive API request failed: 404 gone"), { status: 404 });
}

describe("runDriveBackup", () => {
  it("does nothing when the queue is empty", async () => {
    const createSpy = jest.spyOn(driveApi, "createBackupFile");
    await runDriveBackup(getAccessToken, USER);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("creates a new backup file when none exists yet, and clears the queue", async () => {
    await db.insert(users).values({ id: "u1", name: "Farmer A" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    const createSpy = jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("new-file-id");

    await runDriveBackup(getAccessToken, USER);

    expect(createSpy).toHaveBeenCalledWith("fake-token", expect.any(String));
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
    expect(await getLastBackupAt(USER)).toBeInstanceOf(Date);
  });

  it("updates the existing backup file when one is already known, and clears the queue", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue("existing-file-id");
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);

    await runDriveBackup(getAccessToken, USER);

    expect(updateSpy).toHaveBeenCalledWith("fake-token", "existing-file-id", expect.any(String));
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("reuses a cached file id on the next backup without searching again", async () => {
    await db.insert(users).values({ id: "u1" });
    const findSpy = jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("cached-id");
    await runDriveBackup(getAccessToken, USER);

    await db.update(users).set({ name: "Changed" });
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);
    await runDriveBackup(getAccessToken, USER);

    expect(findSpy).toHaveBeenCalledTimes(1); // only on the first backup
    expect(updateSpy).toHaveBeenCalledWith("fake-token", "cached-id", expect.any(String));
  });

  // Finding 1: the swallowed error made every failure look like a success to
  // the manual "back up now" button. Failures must reach the caller.
  it("rejects when the upload fails, leaving the queue and timestamp untouched", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    jest.spyOn(driveApi, "createBackupFile").mockRejectedValue(new Error("network down"));

    await expect(runDriveBackup(getAccessToken, USER)).rejects.toThrow("network down");

    expect(await db.select().from(dataBackupQueue)).toHaveLength(1);
    expect(await getLastBackupAt(USER)).toBeNull();
  });

  it("succeeds even when a stale snapshot file was left behind by a previous failed backup", async () => {
    await db.insert(users).values({ id: "u1" });
    const staleSnapshotPath = `${FileSystem.documentDirectory}drive-backup-snapshot.db`;
    await FileSystem.writeAsStringAsync(staleSnapshotPath, "leftover from a crashed attempt");
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("new-file-id");

    // Must not throw "destination already exists" from VACUUM INTO.
    await expect(runDriveBackup(getAccessToken, USER)).resolves.toBeUndefined();

    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  // Finding 2: an automatic backup during the restore prompt uploads the
  // (empty by definition) local db over the file being restored from.
  it("skips the upload entirely while a restore is waiting on the user", async () => {
    await db.insert(users).values({ id: "u1" });
    const findSpy = jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    const createSpy = jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("new-file-id");

    setRestorePending(true);
    await runDriveBackup(getAccessToken, USER);

    expect(findSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(await db.select().from(dataBackupQueue)).toHaveLength(1); // still pending

    setRestorePending(false);
    await runDriveBackup(getAccessToken, USER);
    expect(createSpy).toHaveBeenCalledTimes(1); // resumes once answered
  });

  // Finding 7a: interval + AppState + manual button can overlap, and they
  // share one snapshot temp path.
  it("skips a concurrent call while a backup is already in flight", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    let releaseUpload: () => void = () => {};
    const createSpy = jest.spyOn(driveApi, "createBackupFile").mockImplementation(
      () => new Promise<string>((resolve) => {
        releaseUpload = () => resolve("new-file-id");
      }),
    );

    const first = runDriveBackup(getAccessToken, USER);
    await new Promise((r) => setImmediate(r)); // let the first run reach the upload
    expect(createSpy).toHaveBeenCalledTimes(1);

    await runDriveBackup(getAccessToken, USER); // overlapping call, must no-op
    releaseUpload();
    await first;

    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  // Finding 5: the snapshot is taken at the start; writes made during the
  // upload are not in it, so a blanket queue wipe silently drops them.
  it("keeps queue entries created or re-queued during the upload", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    jest.spyOn(driveApi, "createBackupFile").mockImplementation(async () => {
      // A write landing mid-upload: a brand new row...
      await db.insert(users).values({ id: "u2" });
      // ...and an edit to a row that was already queued. queued_at is unix
      // seconds, so bump it by hand rather than race the clock.
      db.$client.execSync("UPDATE data_backup_queue SET queued_at = queued_at + 1 WHERE row_id = 'u1';");
      return "new-file-id";
    });

    await runDriveBackup(getAccessToken, USER);

    const remaining = await db.select().from(dataBackupQueue);
    expect(remaining.map((q) => q.rowId).sort()).toEqual(["u1", "u2"]);
  });
});

// Finding 4: one device, two Clerk accounts.
describe("per-user cache isolation", () => {
  it("does not let a second account reuse the first account's file id or timestamp", async () => {
    await db.insert(users).values({ id: "u1" });
    const findSpy = jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    const createSpy = jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("file-for-a");
    await runDriveBackup(getAccessToken, "user-a");

    await db.update(users).set({ name: "Now signed in as B" });
    createSpy.mockResolvedValue("file-for-b");
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);
    await runDriveBackup(getAccessToken, "user-b");

    // B searched Drive for its own file instead of PATCHing A's cached id.
    expect(findSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(await getLastBackupAt("user-a")).toBeInstanceOf(Date);
    expect(await getLastBackupAt("user-c")).toBeNull();
  });
});

// Finding 4: a cached id can outlive the file (deleted from Drive by hand).
describe("stale cached file id", () => {
  it("clears the cache and searches again when Drive answers 404", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue("dead-id");
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);
    await runDriveBackup(getAccessToken, USER); // caches "dead-id"

    await db.update(users).set({ name: "Changed" });
    updateSpy.mockRejectedValueOnce(notFound()).mockResolvedValue(undefined);
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue("fresh-id");

    await runDriveBackup(getAccessToken, USER);

    expect(updateSpy).toHaveBeenLastCalledWith("fake-token", "fresh-id", expect.any(String));
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);

    // And the fresh id is what gets cached from here on.
    await db.update(users).set({ name: "Changed again" }).where(eq(users.id, "u1"));
    await runDriveBackup(getAccessToken, USER);
    expect(updateSpy).toHaveBeenLastCalledWith("fake-token", "fresh-id", expect.any(String));
  });

  it("creates a new file when the 404 re-search finds nothing", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue("dead-id");
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);
    await runDriveBackup(getAccessToken, USER);

    await db.update(users).set({ name: "Changed" });
    updateSpy.mockRejectedValueOnce(notFound());
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue(null);
    const createSpy = jest.spyOn(driveApi, "createBackupFile").mockResolvedValue("brand-new-id");

    await runDriveBackup(getAccessToken, USER);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("does not retry on a non-404 failure", async () => {
    await db.insert(users).values({ id: "u1" });
    jest.spyOn(driveApi, "findBackupFile").mockResolvedValue("known-id");
    const updateSpy = jest.spyOn(driveApi, "updateBackupFile").mockResolvedValue(undefined);
    await runDriveBackup(getAccessToken, USER);

    await db.update(users).set({ name: "Changed" });
    updateSpy.mockRejectedValue(
      Object.assign(new Error("Drive API request failed: 500 boom"), { status: 500 }),
    );

    await expect(runDriveBackup(getAccessToken, USER)).rejects.toThrow("500");
    expect(updateSpy).toHaveBeenCalledTimes(2); // the first backup, then the failing one
  });
});
