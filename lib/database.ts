import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}

async function initDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("poultry.db");

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prefs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Schema migrations — keyed by PRAGMA user_version
  const vRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const version = vRow?.user_version ?? 0;

  if (version < 1) {
    // Add per-user isolation columns. Existing rows will have NULL user_id and
    // won't appear for any logged-in user, which is the safe default.
    await db.execAsync("ALTER TABLE sales ADD COLUMN user_id TEXT;");
    await db.execAsync("ALTER TABLE drafts ADD COLUMN user_id TEXT;");
    await db.execAsync("PRAGMA user_version = 1;");
  }

  return db;
}
