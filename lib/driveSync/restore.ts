import * as FileSystem from "expo-file-system/legacy";
import { db } from "@/db/client";
import { dataBackupQueue, sales } from "@/db/schema";
import { findBackupFile, driveDownloadUrl } from "./driveApi";

const RESTORE_TEMP_PATH = `${FileSystem.documentDirectory}drive-restore-temp.db`;

// Parent-first — a child row's FK must already exist in `main` before the
// child is inserted. Matches the order migrations 0011/0012 populate.
const TABLES_IN_ORDER = [
  "users", "user_prefs", "batches", "sales",
  "sale_meta_data", "measurement_rows", "row_edit_history",
];

export async function checkForRestorableBackup(
  getAccessToken: () => Promise<string>,
): Promise<{ fileId: string } | null> {
  const hasLocalData = await db.select().from(sales).limit(1).get();
  if (hasLocalData) return null;

  const accessToken = await getAccessToken();
  const fileId = await findBackupFile(accessToken);
  return fileId ? { fileId } : null;
}

// Attaches the downloaded backup as a second database on the same, still-
// open connection, rather than closing/swapping the live db file — see
// this task's note above for why.
export async function restoreFromDrive(
  getAccessToken: () => Promise<string>,
  fileId: string,
): Promise<void> {
  const accessToken = await getAccessToken();

  const { uri } = await FileSystem.downloadAsync(driveDownloadUrl(fileId), RESTORE_TEMP_PATH, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const localPath = uri.startsWith("file://") ? uri.slice("file://".length) : uri;

  db.$client.execSync(`ATTACH DATABASE '${localPath}' AS backup;`);
  try {
    for (const table of TABLES_IN_ORDER) {
      db.$client.execSync(`INSERT INTO main.${table} SELECT * FROM backup.${table};`);
    }
  } finally {
    db.$client.execSync("DETACH DATABASE backup;");
  }

  await FileSystem.deleteAsync(RESTORE_TEMP_PATH, { idempotent: true });
  await db.delete(dataBackupQueue);
}
