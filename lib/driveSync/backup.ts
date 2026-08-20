import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dataBackupQueue } from "@/db/schema";
import {
  findBackupFile,
  createBackupFile,
  updateBackupFile,
} from "./driveApi";

// Both keys are per-user: two Clerk accounts on one device must not share a
// Drive file id (account B would overwrite account A's backup) or a
// "last backed up" timestamp.
const cachedFileIdKey = (userId: string) => `drive-backup-file-id:${userId}`;
const lastBackupAtKey = (userId: string) => `drive-backup-last-at:${userId}`;

export async function getLastBackupAt(userId: string): Promise<Date | null> {
  const v = await AsyncStorage.getItem(lastBackupAtKey(userId));
  return v ? new Date(v) : null;
}

// Only one backup runs at a time. The interval, the AppState listener, the
// mount check and the manual button all land here, and they can overlap —
// a full-db VACUUM INTO + upload easily outlives one interval tick. Two
// overlapping runs would fight over the single snapshot temp path below.
let inFlight = false;

// Set while a restorable backup is waiting on the user's yes/no. Uploading
// during that window overwrites the very file they are about to restore
// from, with a local db that is empty by definition. Every caller routes
// through runDriveBackup, so the guard lives here rather than in each one.
let restorePending = false;

export function setRestorePending(pending: boolean) {
  restorePending = pending;
}

// A clean, consistent single-file snapshot as of this moment — safer than
// copying the live db file directly, which may have an open WAL alongside it.
//
// Cleanup is finally-guarded, and any stale file from a prior failed
// attempt is cleared before VACUUM INTO runs: SQLite's VACUUM INTO fails
// if the destination already exists, so an un-guarded delete here would
// let one interrupted backup (e.g. a read failing after a successful
// VACUUM INTO) permanently wedge every subsequent retry on the same
// "destination already exists" error.
async function snapshotAsBase64(): Promise<string> {
  const snapshotPath = `${FileSystem.documentDirectory}drive-backup-snapshot.db`;
  await FileSystem.deleteAsync(snapshotPath, { idempotent: true });
  db.$client.execSync(`VACUUM INTO '${snapshotPath.replace("file://", "")}'`);
  try {
    return await FileSystem.readAsStringAsync(snapshotPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } finally {
    await FileSystem.deleteAsync(snapshotPath, { idempotent: true });
  }
}

// A cached file id can outlive the file itself — the user can delete it from
// Drive by hand. Drive answers 404 to the PATCH; without this the cache is
// never invalidated and every future backup fails on the same dead id.
async function uploadToExistingFile(
  accessToken: string,
  userId: string,
  fileId: string,
  base64: string,
): Promise<string> {
  try {
    await updateBackupFile(accessToken, fileId, base64);
    return fileId;
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
    await AsyncStorage.removeItem(cachedFileIdKey(userId));
    const found = await findBackupFile(accessToken);
    if (!found) return createBackupFile(accessToken, base64);
    await updateBackupFile(accessToken, found, base64);
    return found;
  }
}

// Throws on any failure. Deliberately: the queue-delete and timestamp-write
// are the last statements, after every fallible step, so an exception leaves
// both untouched and the next run retries. Whether that exception is
// swallowed or surfaced is the caller's call — see `backup` in schedule.ts.
//
// Returns whether an upload actually happened. `false` means the call was
// skipped outright (another backup was already in flight, or a restore is
// pending) — callers must not treat that the same as a completed backup
// (see `backup`/`backupNow` in schedule.ts, and the manual button in
// app/settings.tsx).
export async function runDriveBackup(
  getAccessToken: () => Promise<string>,
  userId: string,
): Promise<boolean> {
  if (restorePending) {
    console.log("[driveSync] backup skipped: a restore is pending");
    return false;
  }
  if (inFlight) {
    console.log("[driveSync] backup skipped: another backup is already in flight");
    return false;
  }
  inFlight = true;
  try {
    // Captured before the snapshot: a write landing during the upload gets
    // queued by the triggers but is *not* in the file being uploaded, so
    // only these exact rows may be cleared afterwards.
    const queued = await db.select().from(dataBackupQueue);
    if (!queued.length) {
      console.log("[driveSync] backup skipped: queue is empty, already backed up");
      return true; // nothing pending — already backed up
    }
    console.log(`[driveSync] backup starting: ${queued.length} queued row(s)`);

    const accessToken = await getAccessToken();
    console.log("[driveSync] got Drive access token");

    const base64 = await snapshotAsBase64();
    console.log(`[driveSync] snapshot taken: ${base64.length} base64 chars`);

    let fileId = await AsyncStorage.getItem(cachedFileIdKey(userId));
    if (fileId) {
      console.log(`[driveSync] using cached Drive file id: ${fileId}`);
    } else {
      fileId = await findBackupFile(accessToken);
      console.log(fileId ? `[driveSync] found existing Drive file: ${fileId}` : "[driveSync] no existing Drive file found");
    }

    if (fileId) {
      fileId = await uploadToExistingFile(accessToken, userId, fileId, base64);
      console.log(`[driveSync] updated Drive file: ${fileId}`);
    } else {
      fileId = await createBackupFile(accessToken, base64);
      console.log(`[driveSync] created new Drive file: ${fileId}`);
    }

    await AsyncStorage.setItem(cachedFileIdKey(userId), fileId);
    // ponytail: queued_at is unix *seconds* (migration 0012), so a re-write
    // landing in the same second as the original enqueue still gets cleared
    // here. Upgrade path if that ever matters: millisecond queued_at.
    for (const q of queued) {
      await db.delete(dataBackupQueue).where(
        and(
          eq(dataBackupQueue.tableName, q.tableName),
          eq(dataBackupQueue.rowId, q.rowId),
          eq(dataBackupQueue.queuedAt, q.queuedAt),
        ),
      );
    }
    await AsyncStorage.setItem(lastBackupAtKey(userId), new Date().toISOString());
    console.log(`[driveSync] backup complete: cleared ${queued.length} queued row(s)`);
    return true;
  } finally {
    inFlight = false;
  }
}
