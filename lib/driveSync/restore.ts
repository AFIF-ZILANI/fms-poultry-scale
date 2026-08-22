import * as FileSystem from "expo-file-system/legacy";
import { db } from "@/db/client";
import { dataBackupQueue, communityPushQueue, sales } from "@/db/schema";
import { findBackupFile, driveDownloadUrl } from "./driveApi";

const RESTORE_TEMP_PATH = `${FileSystem.documentDirectory}drive-restore-temp.db`;

// Parent-first — a child row's FK must already exist in `main` before the
// child is inserted. Matches the order migrations 0011/0012 populate.
const TABLES_IN_ORDER = [
  "users", "user_prefs", "batches", "sales",
  "sale_meta_data", "measurement_rows", "row_edit_history",
];

function columnNames(schema: "main" | "backup", table: string): string[] {
  const stmt = db.$client.prepareSync(`PRAGMA ${schema}.table_info(${table});`);
  try {
    return stmt.executeSync<{ name: string }>().getAllSync().map((c) => c.name);
  } finally {
    stmt.finalizeSync();
  }
}

// `SELECT *` would tie every backup file to the exact schema version that
// wrote it — the first migration adding a column to a synced table makes
// every older backup on Drive unrestorable (column count mismatch). Copying
// only the columns both schemas have degrades gracefully instead: new
// columns take their defaults, columns the app has since dropped are ignored.
function sharedColumns(table: string): string[] {
  const inBackup = new Set(columnNames("backup", table));
  return columnNames("main", table).filter((c) => inBackup.has(c));
}

export async function checkForRestorableBackup(
  getAccessToken: () => Promise<string>,
): Promise<{ fileId: string } | null> {
  const hasLocalData = await db.select().from(sales).limit(1).get();
  if (hasLocalData) {
    console.log("[driveSync] restore check skipped: local data already exists");
    return null;
  }

  const accessToken = await getAccessToken();
  const fileId = await findBackupFile(accessToken);
  console.log(fileId ? `[driveSync] restorable backup found: ${fileId}` : "[driveSync] no restorable backup on Drive");
  return fileId ? { fileId } : null;
}

// Attaches the downloaded backup as a second database on the same, still-
// open connection, rather than closing/swapping the live db file — see
// this task's note above for why.
export async function restoreFromDrive(
  getAccessToken: () => Promise<string>,
  fileId: string,
): Promise<void> {
  console.log(`[driveSync] restore starting: downloading ${fileId}`);
  const accessToken = await getAccessToken();

  const { uri } = await FileSystem.downloadAsync(driveDownloadUrl(fileId), RESTORE_TEMP_PATH, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const localPath = uri.startsWith("file://") ? uri.slice("file://".length) : uri;
  console.log(`[driveSync] downloaded to ${localPath}`);

  db.$client.execSync(`ATTACH DATABASE '${localPath}' AS backup;`);
  try {
    // All seven tables commit together or not at all. Without this, a
    // failure on table 4 leaves the db permanently half-restored: the
    // earlier tables are already committed, and `sales` being non-empty
    // means checkForRestorableBackup never offers a retry.
    db.$client.execSync("BEGIN IMMEDIATE;");
    try {
      for (const table of TABLES_IN_ORDER) {
        // OR REPLACE, not plain INSERT: a local row with the same primary
        // key (onboarding writes a `users` row before any sale exists, and
        // checkForRestorableBackup only looks at `sales`) is exactly what a
        // restore is supposed to overwrite — not a reason to fail.
        const cols = sharedColumns(table).map((c) => `"${c}"`).join(", ");
        if (!cols) {
          console.log(`[driveSync] restore: ${table} absent from backup, skipping`);
          continue; // table absent from an older backup file
        }
        db.$client.execSync(
          `INSERT OR REPLACE INTO main.${table} (${cols}) SELECT ${cols} FROM backup.${table};`,
        );
        console.log(`[driveSync] restore: ${table} copied`);
      }
      db.$client.execSync("COMMIT;");
      console.log("[driveSync] restore: transaction committed");
    } catch (err) {
      // Must resolve the transaction before the finally below detaches —
      // DETACH inside an open transaction is an error. The inner guard is
      // only so a failing ROLLBACK can't mask the real error.
      try {
        db.$client.execSync("ROLLBACK;");
      } catch {
        console.warn("[driveSync] rollback after a failed restore also failed");
      }
      console.warn("[driveSync] restore failed, rolled back", err);
      throw err;
    }
  } finally {
    // Both cleanup steps live in the same finally: if an INSERT throws
    // partway through (a malformed or FK-violating backup file), the temp
    // download — a full copy of the user's data — must not be orphaned on
    // device storage just because the restore itself failed.
    db.$client.execSync("DETACH DATABASE backup;");
    await FileSystem.deleteAsync(RESTORE_TEMP_PATH, { idempotent: true });
  }

  // Only reached on full success — a partial/failed restore must not mark
  // the queue clear, since real dirty data may still need to sync later.
  await db.delete(dataBackupQueue);
  // Same reasoning as dataBackupQueue above: restoring sale_meta_data
  // re-fires community_push_enqueue_insert for every finished sale
  // belonging to a currently-community-plan user, which would silently
  // backfill the user's entire (possibly premium-era) sale history into
  // the push queue. checkForRestorableBackup only runs when `sales` is
  // already empty, so this queue is necessarily empty pre-restore — this
  // is just cleanup of what the restore's own writes just re-enqueued.
  await db.delete(communityPushQueue);
  console.log("[driveSync] restore complete");
}
