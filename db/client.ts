import { drizzle } from "drizzle-orm/expo-sqlite";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import * as SQLite from "expo-sqlite";
import migrations from "./migrations/migrations";
import * as schema from "./schema";

const expoDb = SQLite.openDatabaseSync("poultry.db");
expoDb.execSync("PRAGMA foreign_keys = ON;");
export const db = drizzle(expoDb, { schema });

// Hook to run in your root component
export function useDbMigrations() {
  return useMigrations(db, migrations);
}
