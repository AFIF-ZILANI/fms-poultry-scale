import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "@/db/client";
import { dataBackupQueue } from "@/db/schema";
import {
  findBackupFile,
  createBackupFile,
  updateBackupFile,
} from "./driveApi";

export const LAST_BACKUP_AT_KEY = "drive-backup-last-at";
const CACHED_FILE_ID_KEY = "drive-backup-file-id";

export async function getLastBackupAt(): Promise<Date | null> {
  const v = await AsyncStorage.getItem(LAST_BACKUP_AT_KEY);
  return v ? new Date(v) : null;
}

// A clean, consistent single-file snapshot as of this moment — safer than
// copying the live db file directly, which may have an open WAL alongside it.
async function snapshotAsBase64(): Promise<string> {
  const snapshotPath = `${FileSystem.documentDirectory}drive-backup-snapshot.db`;
  db.$client.execSync(`VACUUM INTO '${snapshotPath.replace("file://", "")}'`);
  const base64 = await FileSystem.readAsStringAsync(snapshotPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.deleteAsync(snapshotPath, { idempotent: true });
  return base64;
}

export async function runDriveBackup(getAccessToken: () => Promise<string>): Promise<void> {
  const queued = await db.select().from(dataBackupQueue).limit(1);
  if (!queued.length) return;

  try {
    const accessToken = await getAccessToken();
    const base64 = await snapshotAsBase64();

    let fileId = await AsyncStorage.getItem(CACHED_FILE_ID_KEY);
    if (!fileId) {
      fileId = await findBackupFile(accessToken);
    }

    if (fileId) {
      await updateBackupFile(accessToken, fileId, base64);
    } else {
      fileId = await createBackupFile(accessToken, base64);
    }

    await AsyncStorage.setItem(CACHED_FILE_ID_KEY, fileId);
    await db.delete(dataBackupQueue);
    await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, new Date().toISOString());
  } catch {
    // If upload fails, leave the queue and timestamp untouched for retry
  }
}
