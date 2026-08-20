import fs from "fs";
import path from "path";
import { db } from "../../db/client";

const MIGRATIONS_DIR = path.join(__dirname, "../../db/migrations");

// Apply the real migration files, in journal order, to the in-memory DB.
// This exercises the migrations themselves, not a hand-maintained copy of
// the schema — a broken migration fails the suite.
export function applyMigrations() {
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  );
  for (const entry of journal.entries) applyMigration(entry.tag);
}

// Apply one migration file by tag. Lets a data migration be tested the way a
// device actually meets it — with rows already in the tables — instead of
// only ever running against the empty DB applyMigrations() starts from.
export function applyMigration(tag: string) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  for (const stmt of sql.split("--> statement-breakpoint")) {
    if (stmt.trim()) db.$client.execSync(stmt);
  }
}

// users is the root of every FK chain, so this empties the whole DB. The
// cascade fires the backup triggers, so the queue is cleared after, not
// before — otherwise every test would start with the previous test's
// teardown sitting in the queue.
export function resetDb() {
  db.$client.execSync("DELETE FROM users;");
  db.$client.execSync("DELETE FROM data_backup_queue;");
}
