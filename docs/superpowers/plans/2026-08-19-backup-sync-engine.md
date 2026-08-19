# Backup Sync Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a Supabase Postgres mirror of the local SQLite tables current per user, so data survives a reinstall or new device, without touching every write call site by hand.

**Architecture:** SQLite `AFTER INSERT/UPDATE/DELETE` triggers on every synced table write a dedup'd dirty-marker into a local `data_backup_queue` table (PK `(table_name, row_id)`, so repeated edits to one row collapse to one entry). A flush routine reads the queue, reads each dirty row's *current* state fresh from SQLite, and upserts it into a matching Supabase table (deletes are pushed by id, relying on matching Postgres FK cascade rules for children). Flush runs on a periodic tick while the app is active and on backgrounding — see Task 7 for why this replaces the spec's literal "idle debounce" without losing the coalescing property. Restore-on-empty pulls the last synced snapshot down once, on a fresh install/device.

**Tech Stack:** Expo, drizzle-orm (sqlite-core), expo-sqlite, `@supabase/supabase-js`, Clerk (`@clerk/expo`), Jest + `node:sqlite` (existing test harness).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-backup-sync-engine-design.md` — read it before starting, every task below implements a section of it.
- Local SQLite stays the single source of truth on-device. Never write logic that treats Supabase as authoritative except during the one-time restore-on-empty path.
- No new dependencies. `AppState` (from `react-native`, already a transitive dep of RN) and `setInterval` cover lifecycle/timing — no NetInfo, no background-task library.
- All synced tables, uniformly: `users`, `userPrefs`, `batches`, `sales`, `saleMetaData`, `measurementRows`, `rowEditHistory`. No plan-based (`community`/`premium`) gating at this layer — that's a downstream ETL concern, not implemented here.
- Match existing code conventions: explicit per-table functions (as in `lib/storage.ts`'s `toSaleRecord`/`toMeasurementRow`), not generic/reflective ORM abstractions.
- Timestamps are stored locally as **seconds** since epoch — Drizzle's `mode: "timestamp"` converts `Date` → `Math.floor(date.getTime() / 1000)` on write and `value * 1000` back to a `Date` on read (`node_modules/drizzle-orm/sqlite-core/columns/integer.js`, `SQLiteTimestamp.mapToDriverValue`/`mapFromDriverValue`). This applies whenever a value goes through Drizzle's typed insert/select API. Any raw SQL touching a timestamp column (e.g. a trigger) must write seconds to match — writing milliseconds there would silently read back 1000x too far in the future.

---

### Task 1: Local `data_backup_queue` table

**Files:**
- Modify: `db/schema.ts`
- Create (generated): `db/migrations/0011_<name>.sql`, `db/migrations/meta/0011_snapshot.json`, updates to `db/migrations/meta/_journal.json` and `db/migrations/migrations.js`

**Interfaces:**
- Produces: `dataBackupQueue` table export from `db/schema.ts`, columns `tableName: text`, `rowId: text`, `op: text (enum "upsert"|"delete")`, `queuedAt: integer (timestamp, ms)`, composite PK `(tableName, rowId)`.

- [ ] **Step 1: Add the table to the schema**

Add to `db/schema.ts`, after the `userPrefs` table and its imports (add `primaryKey` to the existing `drizzle-orm/sqlite-core` import):

```ts
import { sqliteTable, text, real, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
```

```ts
// ─── Data Backup Queue ───
// Populated entirely by triggers (see migration 0012) — never written to
// directly from app code. PK on (table_name, row_id) means N edits to one
// row before the next flush collapse into a single queued operation.
export const dataBackupQueue = sqliteTable("data_backup_queue", {
  tableName: text("table_name").notNull(),
  rowId: text("row_id").notNull(),
  op: text("op", { enum: ["upsert", "delete"] }).notNull(),
  queuedAt: integer("queued_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.tableName, table.rowId] }),
}));
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`

Expected: creates `db/migrations/0011_<auto-name>.sql` containing a `CREATE TABLE` for `data_backup_queue`, a matching `db/migrations/meta/0011_snapshot.json`, and updates both `db/migrations/meta/_journal.json` (new entry, tag `0011_<auto-name>`) and `db/migrations/migrations.js` (new `import m0011 ...` and its entry in the exported `migrations` object) — same shape as the existing `0000`–`0010` entries.

- [ ] **Step 3: Verify the migration applies cleanly in the test harness**

Run: `npx jest __tests__/storage.test.ts -t "returns an empty list when the user has no sales"`
Expected: PASS (this exercises `applyMigrations()` in `__tests__/helpers/db.ts`, which replays every file in the journal — a broken 0011 migration fails immediately here).

- [ ] **Step 4: Commit**

```bash
git add db/schema.ts db/migrations/
git commit -m "$(cat <<'EOF'
feat(backup): add data_backup_queue table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: SQLite triggers that populate the queue

**Files:**
- Create (scaffolded then hand-filled): `db/migrations/0012_backup_queue_triggers.sql`
- Modify (auto, by the scaffold command): `db/migrations/meta/_journal.json`, `db/migrations/migrations.js`
- Test: `__tests__/backupQueue.test.ts`

**Interfaces:**
- Consumes: `dataBackupQueue`, `users`, `userPrefs`, `batches`, `sales`, `saleMetaData`, `measurementRows`, `rowEditHistory` from `db/schema.ts` (Task 1 and existing).
- Produces: guarantee that any INSERT/UPDATE/DELETE on a synced table results in exactly one row in `data_backup_queue` keyed by `(table_name, row_id)`, with `op` reflecting the most recent operation.

- [ ] **Step 1: Scaffold the custom migration**

Run: `npx drizzle-kit generate --custom --name=backup_queue_triggers`

Expected: creates an empty `db/migrations/0012_backup_queue_triggers.sql`, and registers it in `_journal.json`/`migrations.js` (same mechanism that registered the hand-written `0010_settled_at_sale_time.sql` backfill — this is the existing precedent for non-schema-diff migrations in this repo).

- [ ] **Step 2: Write the trigger SQL**

Replace the contents of `db/migrations/0012_backup_queue_triggers.sql` with (one INSERT/UPDATE/DELETE trigger per synced table — 21 triggers total; `queued_at` uses `CAST(strftime('%s','now') AS INTEGER)` for seconds since epoch, matching this codebase's Drizzle `mode: "timestamp"` convention — see Global Constraints):

```sql
-- users
CREATE TRIGGER trg_backup_users_ai AFTER INSERT ON users BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('users', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_users_au AFTER UPDATE ON users BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('users', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_users_ad AFTER DELETE ON users BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('users', OLD.id, 'delete', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
-- user_prefs (PK is user_id, not id)
CREATE TRIGGER trg_backup_user_prefs_ai AFTER INSERT ON user_prefs BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('user_prefs', NEW.user_id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_user_prefs_au AFTER UPDATE ON user_prefs BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('user_prefs', NEW.user_id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_user_prefs_ad AFTER DELETE ON user_prefs BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('user_prefs', OLD.user_id, 'delete', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
-- batches
CREATE TRIGGER trg_backup_batches_ai AFTER INSERT ON batches BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('batches', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_batches_au AFTER UPDATE ON batches BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('batches', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_batches_ad AFTER DELETE ON batches BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('batches', OLD.id, 'delete', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
-- sales
CREATE TRIGGER trg_backup_sales_ai AFTER INSERT ON sales BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('sales', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_sales_au AFTER UPDATE ON sales BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('sales', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_sales_ad AFTER DELETE ON sales BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('sales', OLD.id, 'delete', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
-- sale_meta_data (PK is sale_id, not id)
CREATE TRIGGER trg_backup_sale_meta_data_ai AFTER INSERT ON sale_meta_data BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('sale_meta_data', NEW.sale_id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_sale_meta_data_au AFTER UPDATE ON sale_meta_data BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('sale_meta_data', NEW.sale_id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_sale_meta_data_ad AFTER DELETE ON sale_meta_data BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('sale_meta_data', OLD.sale_id, 'delete', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
-- measurement_rows
CREATE TRIGGER trg_backup_measurement_rows_ai AFTER INSERT ON measurement_rows BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('measurement_rows', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_measurement_rows_au AFTER UPDATE ON measurement_rows BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('measurement_rows', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_measurement_rows_ad AFTER DELETE ON measurement_rows BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('measurement_rows', OLD.id, 'delete', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
-- row_edit_history
CREATE TRIGGER trg_backup_row_edit_history_ai AFTER INSERT ON row_edit_history BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('row_edit_history', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_row_edit_history_au AFTER UPDATE ON row_edit_history BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('row_edit_history', NEW.id, 'upsert', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_backup_row_edit_history_ad AFTER DELETE ON row_edit_history BEGIN
  INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
  VALUES ('row_edit_history', OLD.id, 'delete', CAST(strftime('%s','now') AS INTEGER))
  ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at;
END;
```

- [ ] **Step 3: Write the failing test**

Create `__tests__/backupQueue.test.ts`:

```ts
import { db } from "../db/client";
import { users, batches, dataBackupQueue } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { applyMigrations, resetDb } from "./helpers/db";

beforeAll(() => applyMigrations());
beforeEach(() => resetDb());

async function queueRow(table: string, rowId: string) {
  return db
    .select()
    .from(dataBackupQueue)
    .where(and(eq(dataBackupQueue.tableName, table), eq(dataBackupQueue.rowId, rowId)))
    .get();
}

describe("backup queue triggers", () => {
  it("queues an upsert on insert", async () => {
    await db.insert(users).values({ id: "u1" });
    const q = await queueRow("users", "u1");
    expect(q?.op).toBe("upsert");
  });

  it("collapses repeated edits to the same row into one queue entry", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.update(users).set({ name: "A" }).where(eq(users.id, "u1"));
    await db.update(users).set({ name: "B" }).where(eq(users.id, "u1"));
    await db.update(users).set({ name: "C" }).where(eq(users.id, "u1"));

    const all = await db.select().from(dataBackupQueue).where(eq(dataBackupQueue.tableName, "users"));
    expect(all).toHaveLength(1);
    expect(all[0].op).toBe("upsert");
  });

  it("queues a delete, overwriting a pending upsert for the same row", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.delete(users).where(eq(users.id, "u1"));

    const q = await queueRow("users", "u1");
    expect(q?.op).toBe("delete");
  });

  it("queues batches under their own table name with the row's id", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.insert(batches).values({
      id: "b1", userId: "u1", name: "Shed 1",
      createdAt: new Date(), updatedAt: new Date(),
    });

    const q = await queueRow("batches", "b1");
    expect(q?.op).toBe("upsert");
  });
});
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx jest __tests__/backupQueue.test.ts -v`
Expected: all 4 tests PASS. (No separate "run to verify it fails" step here — the trigger SQL is written in Step 2 before the test exists to fail against; this is schema/migration work, not TDD on app logic.)

- [ ] **Step 5: Commit**

```bash
git add db/migrations/ __tests__/backupQueue.test.ts
git commit -m "$(cat <<'EOF'
feat(backup): trigger-populate the backup queue on every write

AFTER INSERT/UPDATE/DELETE triggers on every synced table, so no future
write path can forget to queue itself for backup.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Supabase mirror schema + RLS

**Files:**
- Create: `supabase/backup_mirror.sql`

**Interfaces:**
- Produces: Postgres tables `users`, `user_prefs`, `batches`, `sales`, `sale_meta_data`, `measurement_rows`, `row_edit_history`, column-for-column matches to the local SQLite tables, with RLS restricting every row to its owning Clerk user.

This file is not applied by drizzle (`drizzle.config.ts` targets `dialect: 'sqlite'` only — the local db). It's a one-time script run manually against the Supabase project.

- [ ] **Step 1: Write the DDL + RLS file**

Create `supabase/backup_mirror.sql`:

```sql
-- Backup mirror for poultry-scale. Run once via the Supabase SQL editor or
-- `supabase db execute -f supabase/backup_mirror.sql`. Column names and
-- types match db/schema.ts exactly — keep them in sync by hand if the local
-- schema changes; there is no auto-sync between the two.

create table if not exists users (
  id text primary key,
  name text,
  phone text,
  email text,
  location text,
  farm_name text,
  is_onboarded boolean not null default false,
  business_name text,
  role text not null default 'farmer',
  subscription_plan text not null default 'community',
  farm_capacity integer,
  buying_capacity integer,
  breed text,
  supply_regions text,
  created_at timestamptz
);

create table if not exists user_prefs (
  user_id text primary key references users(id) on delete cascade,
  language text not null default 'en',
  theme text not null default 'system',
  log_group_size integer not null default 10,
  kg_per_crate real not null default 0,
  deduction_wt_g real not null default 0,
  price_kg real not null default 0
);

create table if not exists batches (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  closed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists sales (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  batch_id text references batches(id) on delete set null,
  phase text not null,
  is_pcs_tracked boolean not null,
  has_cull boolean not null default false,
  is_finished boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists sale_meta_data (
  sale_id text primary key references sales(id) on delete cascade,
  main_weight_kg real not null,
  main_pcs integer,
  buyer_name text,
  kg_per_crate real not null,
  deduction_per_crate_g real not null,
  is_full_crates_only boolean not null,
  main_price real not null,
  main_amount real not null,
  cull_weight_kg real not null default 0,
  is_cull_sold boolean,
  cull_sale_type text,
  cull_price real,
  cull_pcs integer,
  cull_amount real,
  final_amount real not null,
  received_amount real not null,
  total_deduction_wt_kg real not null,
  avg_wt_grams real,
  net_weight_kg real not null,
  total_crates real not null,
  total_pcs integer,
  created_at timestamptz not null
);

create table if not exists measurement_rows (
  id text primary key,
  sale_id text not null references sales(id) on delete cascade,
  type text not null,
  weight real not null,
  pcs integer,
  created_at timestamptz not null
);

create table if not exists row_edit_history (
  id text primary key,
  row_id text not null references measurement_rows(id) on delete cascade,
  previous_weight real not null,
  previous_pcs integer,
  new_weight real not null,
  new_pcs integer,
  reason text,
  created_at timestamptz not null
);

-- ─── RLS: every row is only visible/writable by its owning Clerk user ───
-- Assumes Supabase's Clerk third-party auth integration is configured, so
-- auth.jwt()->>'sub' is the signed-in Clerk user id.

alter table users enable row level security;
create policy "own row" on users for all
  using (id = (auth.jwt()->>'sub')) with check (id = (auth.jwt()->>'sub'));

alter table user_prefs enable row level security;
create policy "own row" on user_prefs for all
  using (user_id = (auth.jwt()->>'sub')) with check (user_id = (auth.jwt()->>'sub'));

alter table batches enable row level security;
create policy "own row" on batches for all
  using (user_id = (auth.jwt()->>'sub')) with check (user_id = (auth.jwt()->>'sub'));

alter table sales enable row level security;
create policy "own row" on sales for all
  using (user_id = (auth.jwt()->>'sub')) with check (user_id = (auth.jwt()->>'sub'));

alter table sale_meta_data enable row level security;
create policy "own row" on sale_meta_data for all
  using (sale_id in (select id from sales where user_id = (auth.jwt()->>'sub')))
  with check (sale_id in (select id from sales where user_id = (auth.jwt()->>'sub')));

alter table measurement_rows enable row level security;
create policy "own row" on measurement_rows for all
  using (sale_id in (select id from sales where user_id = (auth.jwt()->>'sub')))
  with check (sale_id in (select id from sales where user_id = (auth.jwt()->>'sub')));

alter table row_edit_history enable row level security;
create policy "own row" on row_edit_history for all
  using (row_id in (
    select mr.id from measurement_rows mr
    join sales s on s.id = mr.sale_id
    where s.user_id = (auth.jwt()->>'sub')
  ))
  with check (row_id in (
    select mr.id from measurement_rows mr
    join sales s on s.id = mr.sale_id
    where s.user_id = (auth.jwt()->>'sub')
  ));
```

- [ ] **Step 2: Run it against the Supabase project**

Via the Supabase dashboard SQL editor (paste and run), or CLI: `supabase db execute -f supabase/backup_mirror.sql --project-ref <project-ref>`.
Expected: 7 tables created, RLS enabled with one policy each. Verify in the dashboard's Table Editor that RLS shows "Enabled" on all 7.

- [ ] **Step 3: Commit**

```bash
git add supabase/backup_mirror.sql
git commit -m "$(cat <<'EOF'
feat(backup): add Supabase mirror schema + RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Table registry

**Files:**
- Create: `lib/backupSync/tables.ts`

**Interfaces:**
- Produces: `SYNCED_TABLES` (parent-first order array of table name strings) used by Task 5 (flush) and Task 6 (restore).

- [ ] **Step 1: Write the registry**

Create `lib/backupSync/tables.ts`:

```ts
// Parent-first: a remote row is never upserted before the row it references.
// Flush deletes walk this list in reverse (child-first) for the same reason.
export const SYNCED_TABLES = [
  "users",
  "user_prefs",
  "batches",
  "sales",
  "sale_meta_data",
  "measurement_rows",
  "row_edit_history",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

// The remote (and local SQL) primary key column for each table — differs
// from "id" for the two tables whose PK is a foreign key (see db/schema.ts).
export const PK_COLUMN: Record<SyncedTable, string> = {
  users: "id",
  user_prefs: "user_id",
  batches: "id",
  sales: "id",
  sale_meta_data: "sale_id",
  measurement_rows: "id",
  row_edit_history: "id",
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/backupSync/tables.ts
git commit -m "$(cat <<'EOF'
feat(backup): add synced-table registry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Flush logic

**Files:**
- Create: `lib/backupSync/flush.ts`
- Test: `__tests__/backupFlush.test.ts`

**Interfaces:**
- Consumes: `SYNCED_TABLES`, `PK_COLUMN` from `lib/backupSync/tables.ts` (Task 4); `dataBackupQueue`, `users`, `userPrefs`, `batches`, `sales`, `saleMetaData`, `measurementRows`, `rowEditHistory` from `db/schema.ts`.
- Produces: `flushBackupQueue(supabase: SupabaseClient): Promise<void>` — exported for Task 7 (scheduling) to call.

`SupabaseClient` here only needs `.from(table).upsert(rows, opts)` and `.from(table).delete().eq(col, id)`, both of which resolve to `{ error }`. Tests use a hand-rolled fake object structurally matching that surface, cast through `as unknown as SupabaseClient` — no real network client needed.

- [ ] **Step 1: Write the failing test**

Create `__tests__/backupFlush.test.ts`:

```ts
import { db } from "../db/client";
import { users, batches, dataBackupQueue } from "../db/schema";
import { eq } from "drizzle-orm";
import { applyMigrations, resetDb } from "./helpers/db";
import { flushBackupQueue } from "../lib/backupSync/flush";
import type { SupabaseClient } from "@supabase/supabase-js";

beforeAll(() => applyMigrations());
beforeEach(() => resetDb());

function fakeSupabase() {
  const upserts: { table: string; rows: any[] }[] = [];
  const deletes: { table: string; column: string; id: string }[] = [];
  const client = {
    from(table: string) {
      return {
        upsert: async (rows: any[]) => {
          upserts.push({ table, rows });
          return { error: null };
        },
        delete: () => ({
          eq: async (column: string, id: string) => {
            deletes.push({ table, column, id });
            return { error: null };
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, upserts, deletes };
}

describe("flushBackupQueue", () => {
  it("does nothing when the queue is empty", async () => {
    const { client, upserts } = fakeSupabase();
    await flushBackupQueue(client);
    expect(upserts).toHaveLength(0);
  });

  it("pushes the current row state and clears the queue on success", async () => {
    await db.insert(users).values({ id: "u1", name: "Farmer A" });
    const { client, upserts } = fakeSupabase();

    await flushBackupQueue(client);

    expect(upserts).toEqual([
      { table: "users", rows: [expect.objectContaining({ id: "u1", name: "Farmer A" })] },
    ]);
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("collapses repeated edits into one push, reading the latest state", async () => {
    await db.insert(users).values({ id: "u1", name: "A" });
    await db.update(users).set({ name: "B" }).where(eq(users.id, "u1"));
    await db.update(users).set({ name: "C" }).where(eq(users.id, "u1"));
    const { client, upserts } = fakeSupabase();

    await flushBackupQueue(client);

    const userUpserts = upserts.filter((u) => u.table === "users");
    expect(userUpserts).toHaveLength(1);
    expect(userUpserts[0].rows[0].name).toBe("C");
  });

  it("pushes deletes and clears the queue", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.delete(users).where(eq(users.id, "u1"));
    const { client, deletes } = fakeSupabase();

    await flushBackupQueue(client);

    expect(deletes).toEqual([{ table: "users", column: "id", id: "u1" }]);
    expect(await db.select().from(dataBackupQueue)).toHaveLength(0);
  });

  it("leaves the queue entry in place when the push fails", async () => {
    await db.insert(users).values({ id: "u1" });
    const failing = {
      from: () => ({
        upsert: async () => ({ error: { message: "network down" } }),
        delete: () => ({ eq: async () => ({ error: { message: "network down" } }) }),
      }),
    } as unknown as SupabaseClient;

    await flushBackupQueue(failing);

    expect(await db.select().from(dataBackupQueue)).toHaveLength(1);
  });

  it("upserts parent tables before child tables in one flush", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.insert(batches).values({
      id: "b1", userId: "u1", name: "Shed 1",
      createdAt: new Date(), updatedAt: new Date(),
    });
    const order: string[] = [];
    const client = {
      from(table: string) {
        return {
          upsert: async () => { order.push(table); return { error: null }; },
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      },
    } as unknown as SupabaseClient;

    await flushBackupQueue(client);

    expect(order.indexOf("users")).toBeLessThan(order.indexOf("batches"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/backupFlush.test.ts -v`
Expected: FAIL — `Cannot find module '../lib/backupSync/flush'`.

- [ ] **Step 3: Write the implementation**

Create `lib/backupSync/flush.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/db/client";
import {
  dataBackupQueue,
  users,
  userPrefs,
  batches,
  sales,
  saleMetaData,
  measurementRows,
  rowEditHistory,
} from "@/db/schema";
import { SYNCED_TABLES, PK_COLUMN, type SyncedTable } from "./tables";

// Reads the row's *current* local state, not a stored diff — that's what
// lets repeated edits collapse into one push (see the queue's PK in
// db/schema.ts). Returns null if the row was deleted locally before this
// flush ran; the caller treats that as "nothing to push, but fine."
async function readCurrentRow(table: SyncedTable, id: string): Promise<Record<string, unknown> | null> {
  switch (table) {
    case "users":
      return (await db.select().from(users).where(eq(users.id, id)).get()) ?? null;
    case "user_prefs":
      return (await db.select().from(userPrefs).where(eq(userPrefs.userId, id)).get()) ?? null;
    case "batches":
      return (await db.select().from(batches).where(eq(batches.id, id)).get()) ?? null;
    case "sales":
      return (await db.select().from(sales).where(eq(sales.id, id)).get()) ?? null;
    case "sale_meta_data":
      return (await db.select().from(saleMetaData).where(eq(saleMetaData.saleId, id)).get()) ?? null;
    case "measurement_rows":
      return (await db.select().from(measurementRows).where(eq(measurementRows.id, id)).get()) ?? null;
    case "row_edit_history":
      return (await db.select().from(rowEditHistory).where(eq(rowEditHistory.id, id)).get()) ?? null;
  }
}

async function pushUpsert(supabase: SupabaseClient, table: SyncedTable, id: string): Promise<boolean> {
  const row = await readCurrentRow(table, id);
  if (!row) return true; // deleted locally before flush ran — nothing to push
  const { error } = await supabase.from(table).upsert([row], { onConflict: PK_COLUMN[table] });
  return !error;
}

async function pushDelete(supabase: SupabaseClient, table: SyncedTable, id: string): Promise<boolean> {
  const { error } = await supabase.from(table).delete().eq(PK_COLUMN[table], id);
  return !error;
}

export async function flushBackupQueue(supabase: SupabaseClient): Promise<void> {
  const queued = await db.select().from(dataBackupQueue);
  if (!queued.length) return;

  const byTable = new Map<SyncedTable, typeof queued>();
  for (const row of queued) {
    const table = row.tableName as SyncedTable;
    const list = byTable.get(table) ?? [];
    list.push(row);
    byTable.set(table, list);
  }

  const synced: { tableName: string; rowId: string }[] = [];

  // Upserts parent-first, deletes child-first — both respect the FK chain
  // the Supabase mirror shares with the local schema (see Task 3).
  for (const table of SYNCED_TABLES) {
    for (const q of (byTable.get(table) ?? []).filter((q) => q.op === "upsert")) {
      if (await pushUpsert(supabase, table, q.rowId)) {
        synced.push({ tableName: q.tableName, rowId: q.rowId });
      }
    }
  }
  for (const table of [...SYNCED_TABLES].reverse()) {
    for (const q of (byTable.get(table) ?? []).filter((q) => q.op === "delete")) {
      if (await pushDelete(supabase, table, q.rowId)) {
        synced.push({ tableName: q.tableName, rowId: q.rowId });
      }
    }
  }

  for (const s of synced) {
    await db
      .delete(dataBackupQueue)
      .where(and(eq(dataBackupQueue.tableName, s.tableName), eq(dataBackupQueue.rowId, s.rowId)));
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx jest __tests__/backupFlush.test.ts -v`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/backupSync/flush.ts __tests__/backupFlush.test.ts
git commit -m "$(cat <<'EOF'
feat(backup): implement queue flush to Supabase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Restore on empty local DB

**Files:**
- Create: `lib/backupSync/restore.ts`
- Test: `__tests__/backupRestore.test.ts`

**Interfaces:**
- Consumes: `SYNCED_TABLES` order from `lib/backupSync/tables.ts`; all synced table exports from `db/schema.ts`.
- Produces: `restoreIfEmpty(userId: string, supabase: SupabaseClient): Promise<void>` — exported for Task 7 to call once on app launch.

Remote rows come back from Supabase with snake_case column names and ISO timestamp strings (Postgres defaults) — they don't match the camelCase, `Date`-typed shape drizzle's `.values()` expects locally, so each table gets an explicit mapper. This mirrors the existing `toSaleRecord`/`toMeasurementRow` pattern in `lib/storage.ts` rather than a generic key-case converter — `users.is_onboarded` keeps that exact (non-camelCase) name as its JS property in `db/schema.ts`, so a blanket snake→camel converter would silently produce the wrong key for that one field. Explicit, table-by-table mapping is the only version of this that can't get that wrong.

- [ ] **Step 1: Write the failing test**

Create `__tests__/backupRestore.test.ts`:

```ts
import { db } from "../db/client";
import { users, sales, batches } from "../db/schema";
import { applyMigrations, resetDb } from "./helpers/db";
import { restoreIfEmpty } from "../lib/backupSync/restore";
import type { SupabaseClient } from "@supabase/supabase-js";

beforeAll(() => applyMigrations());
beforeEach(() => resetDb());

function fakeSupabase(rows: Record<string, any[]>) {
  const client = {
    from(table: string) {
      const data = rows[table] ?? [];
      const builder: any = {
        select: () => builder,
        eq: (_col: string, _val: string) => builder,
        in: (_col: string, _vals: string[]) => builder,
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        then: (resolve: any) => resolve({ data, error: null }),
      };
      return builder;
    },
  };
  return client as unknown as SupabaseClient;
}

describe("restoreIfEmpty", () => {
  it("does nothing if local data already exists", async () => {
    await db.insert(users).values({ id: "u1" });
    await db.insert(batches).values({
      id: "b1", userId: "u1", name: "Shed 1",
      createdAt: new Date(), updatedAt: new Date(),
    });
    await db.insert(sales).values({
      id: "s1", userId: "u1", phase: "main", isPcsTracked: true,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const supabase = fakeSupabase({
      users: [{ id: "u1", name: "Remote Name", is_onboarded: true, role: "farmer", subscription_plan: "community", created_at: "2026-01-01T00:00:00Z" }],
    });
    await restoreIfEmpty("u1", supabase);

    const local = await db.select().from(sales);
    expect(local).toHaveLength(1);
  });

  it("does nothing when the remote account has no data either", async () => {
    const supabase = fakeSupabase({ users: [] });
    await restoreIfEmpty("u1", supabase);
    expect(await db.select().from(sales)).toHaveLength(0);
  });

  it("pulls down a remote user, batch, sale and meta into the empty local DB", async () => {
    const supabase = fakeSupabase({
      users: [{
        id: "u1", name: "Farmer A", phone: null, email: null, location: null,
        farm_name: null, is_onboarded: true, business_name: null, role: "farmer",
        subscription_plan: "community", farm_capacity: null, buying_capacity: null,
        breed: null, supply_regions: null, created_at: "2026-01-01T00:00:00Z",
      }],
      user_prefs: [],
      batches: [{
        id: "b1", user_id: "u1", name: "Shed 1", closed_at: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
      sales: [{
        id: "s1", user_id: "u1", batch_id: "b1", phase: "main",
        is_pcs_tracked: true, has_cull: false, is_finished: true,
        created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
      }],
      sale_meta_data: [{
        sale_id: "s1", main_weight_kg: 10, main_pcs: 5, buyer_name: null,
        kg_per_crate: 2, deduction_per_crate_g: 200, is_full_crates_only: false,
        main_price: 100, main_amount: 900, cull_weight_kg: 0, is_cull_sold: null,
        cull_sale_type: null, cull_price: null, cull_pcs: null, cull_amount: null,
        final_amount: 900, received_amount: 900, total_deduction_wt_kg: 1,
        avg_wt_grams: null, net_weight_kg: 9, total_crates: 5, total_pcs: 5,
        created_at: "2026-01-02T00:00:00Z",
      }],
      measurement_rows: [],
      row_edit_history: [],
    });

    await restoreIfEmpty("u1", supabase);

    const [restoredBatch] = await db.select().from(batches);
    expect(restoredBatch.name).toBe("Shed 1");
    const [restoredSale] = await db.select().from(sales);
    expect(restoredSale.id).toBe("s1");
    expect(restoredSale.createdAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/backupRestore.test.ts -v`
Expected: FAIL — `Cannot find module '../lib/backupSync/restore'`.

- [ ] **Step 3: Write the implementation**

Create `lib/backupSync/restore.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/db/client";
import {
  dataBackupQueue,
  users,
  userPrefs,
  batches,
  sales,
  saleMetaData,
  measurementRows,
  rowEditHistory,
} from "@/db/schema";

function toDate(v: string | null): Date | null {
  return v === null || v === undefined ? null : new Date(v);
}

function fromRemoteUser(r: any): typeof users.$inferInsert {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    location: r.location,
    farmName: r.farm_name,
    is_onboarded: r.is_onboarded,
    businessName: r.business_name,
    role: r.role,
    subscriptionPlan: r.subscription_plan,
    farmCapacity: r.farm_capacity,
    buyingCapacity: r.buying_capacity,
    breed: r.breed,
    supplyRegions: r.supply_regions,
    createdAt: toDate(r.created_at) ?? new Date(),
  };
}

function fromRemoteUserPrefs(r: any): typeof userPrefs.$inferInsert {
  return {
    userId: r.user_id,
    language: r.language,
    theme: r.theme,
    logGroupSize: r.log_group_size,
    kgPerCrate: r.kg_per_crate,
    deductionWtG: r.deduction_wt_g,
    priceKg: r.price_kg,
  };
}

function fromRemoteBatch(r: any): typeof batches.$inferInsert {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    closedAt: toDate(r.closed_at),
    createdAt: toDate(r.created_at) ?? new Date(),
    updatedAt: toDate(r.updated_at) ?? new Date(),
  };
}

function fromRemoteSale(r: any): typeof sales.$inferInsert {
  return {
    id: r.id,
    userId: r.user_id,
    batchId: r.batch_id,
    phase: r.phase,
    isPcsTracked: r.is_pcs_tracked,
    hasCull: r.has_cull,
    isFinished: r.is_finished,
    createdAt: toDate(r.created_at) ?? new Date(),
    updatedAt: toDate(r.updated_at) ?? new Date(),
  };
}

function fromRemoteSaleMeta(r: any): typeof saleMetaData.$inferInsert {
  return {
    saleId: r.sale_id,
    mainWeightKg: r.main_weight_kg,
    mainPcs: r.main_pcs,
    buyerName: r.buyer_name,
    kgPerCrate: r.kg_per_crate,
    deductionPerCrateG: r.deduction_per_crate_g,
    isFullCratesOnly: r.is_full_crates_only,
    mainPrice: r.main_price,
    mainAmount: r.main_amount,
    cullWeightKg: r.cull_weight_kg,
    isCullSold: r.is_cull_sold,
    cullSaleType: r.cull_sale_type,
    cullPrice: r.cull_price,
    cullPcs: r.cull_pcs,
    cullAmount: r.cull_amount,
    finalAmount: r.final_amount,
    receivedAmount: r.received_amount,
    totalDeductionWtKg: r.total_deduction_wt_kg,
    avgWtGrams: r.avg_wt_grams,
    netWeightKg: r.net_weight_kg,
    totalCrates: r.total_crates,
    totalPcs: r.total_pcs,
    createdAt: toDate(r.created_at) ?? new Date(),
  };
}

function fromRemoteMeasurementRow(r: any): typeof measurementRows.$inferInsert {
  return {
    id: r.id,
    saleId: r.sale_id,
    type: r.type,
    weight: r.weight,
    pcs: r.pcs,
    createdAt: toDate(r.created_at) ?? new Date(),
  };
}

function fromRemoteEditHistory(r: any): typeof rowEditHistory.$inferInsert {
  return {
    id: r.id,
    rowId: r.row_id,
    previousWeight: r.previous_weight,
    previousPcs: r.previous_pcs,
    newWeight: r.new_weight,
    newPcs: r.new_pcs,
    reason: r.reason,
    createdAt: toDate(r.created_at) ?? new Date(),
  };
}

// Parent-first, same order the flush upserts use — a child row's FK must
// already exist locally before the child is inserted.
export async function restoreIfEmpty(userId: string, supabase: SupabaseClient): Promise<void> {
  const hasLocalData = await db.select().from(sales).limit(1).get();
  if (hasLocalData) return; // not a fresh install/device — never overwrite live local data

  const { data: remoteUser } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (!remoteUser) return; // genuinely new account, nothing to restore

  await db.insert(users).values(fromRemoteUser(remoteUser)).onConflictDoNothing();

  const { data: prefs } = await supabase.from("user_prefs").select("*").eq("user_id", userId);
  if (prefs?.length) {
    await db.insert(userPrefs).values(prefs.map(fromRemoteUserPrefs)).onConflictDoNothing();
  }

  const { data: remoteBatches } = await supabase.from("batches").select("*").eq("user_id", userId);
  if (remoteBatches?.length) {
    await db.insert(batches).values(remoteBatches.map(fromRemoteBatch)).onConflictDoNothing();
  }

  const { data: remoteSales } = await supabase.from("sales").select("*").eq("user_id", userId);
  if (remoteSales?.length) {
    await db.insert(sales).values(remoteSales.map(fromRemoteSale)).onConflictDoNothing();
  }

  const saleIds: string[] = (remoteSales ?? []).map((s: any) => s.id);
  if (saleIds.length) {
    const { data: meta } = await supabase.from("sale_meta_data").select("*").in("sale_id", saleIds);
    if (meta?.length) {
      await db.insert(saleMetaData).values(meta.map(fromRemoteSaleMeta)).onConflictDoNothing();
    }

    const { data: rows } = await supabase.from("measurement_rows").select("*").in("sale_id", saleIds);
    if (rows?.length) {
      await db.insert(measurementRows).values(rows.map(fromRemoteMeasurementRow)).onConflictDoNothing();
    }

    const rowIds: string[] = (rows ?? []).map((r: any) => r.id);
    if (rowIds.length) {
      const { data: history } = await supabase.from("row_edit_history").select("*").in("row_id", rowIds);
      if (history?.length) {
        await db.insert(rowEditHistory).values(history.map(fromRemoteEditHistory)).onConflictDoNothing();
      }
    }
  }

  // The restored rows are already identical to what's on Supabase, but the
  // insert triggers from Task 2 fired anyway and queued them as dirty —
  // clear that so restore doesn't cause an immediate, redundant push.
  await db.delete(dataBackupQueue);
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx jest __tests__/backupRestore.test.ts -v`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/backupSync/restore.ts __tests__/backupRestore.test.ts
git commit -m "$(cat <<'EOF'
feat(backup): restore from Supabase into an empty local DB

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Scheduling — wire flush/restore into app lifecycle

**Files:**
- Create: `lib/backupSync/schedule.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `flushBackupQueue` (Task 5), `restoreIfEmpty` (Task 6), `useSupabase` (`hooks/useSupabase.ts`, existing).
- Produces: `useBackupSync(userId: string | null | undefined): void` — a hook with no return value, mounted once in `AuthGuard`.

**Deviation from the spec's literal trigger list, and why:** the spec (§6) lists "debounce after writes go quiet" as a trigger, which would mean calling a `scheduleFlush()` from every mutating function in `lib/storage.ts` — the same per-call-site fragility Task 2 deliberately avoided for queue population. Since the queue's correctness already doesn't depend on *when* flush runs (triggers guarantee nothing is missed), a periodic tick achieves the same practical coalescing — rapid edits between ticks still collapse into one push — without touching `lib/storage.ts` at all. This task uses: a 10s interval while the app is in the foreground, plus a flush on `AppState` transitioning to `background`, plus one restore-then-flush on mount. No new dependency (`AppState` is from `react-native`, already present).

This task's deliverable is UI lifecycle wiring, not pure logic — there's no meaningful unit test for `setInterval`/`AppState` glue in this codebase's Jest+node harness (no React Native component testing is set up here; `__tests__/` only covers `lib/storage.ts`-style pure logic against real SQLite, per the existing test suite). Verify this task by running the app, per Step 4.

- [ ] **Step 1: Write the hook**

Create `lib/backupSync/schedule.ts`:

```ts
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSupabase } from "@/hooks/useSupabase";
import { flushBackupQueue } from "./flush";
import { restoreIfEmpty } from "./restore";

const FLUSH_INTERVAL_MS = 10_000;

export function useBackupSync(userId: string | null | undefined): void {
  const supabase = useSupabase();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      await restoreIfEmpty(userId, supabase);
      if (!cancelled) await flushBackupQueue(supabase);
    })();

    const interval = setInterval(() => {
      flushBackupQueue(supabase);
    }, FLUSH_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current === "active" && next === "background") {
        flushBackupQueue(supabase);
      }
      appState.current = next;
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId, supabase]);
}
```

- [ ] **Step 2: Wire it into the root layout**

Modify `app/_layout.tsx`. Add the import near the other `@/` imports:

```ts
import { useBackupSync } from "@/lib/backupSync/schedule";
```

Inside `AuthGuard` (`app/_layout.tsx:47-81`), call the hook right after the existing hooks, using `user?.id`:

```ts
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const handledUserId = useRef<string | null>(null);
  useBackupSync(isSignedIn ? user?.id : null);

  // ...rest unchanged
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by `lib/backupSync/schedule.ts` or `app/_layout.tsx`.

- [ ] **Step 4: Manual verification**

Run: `npx expo start`, open the app, sign in with an account whose Supabase mirror has no `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_KEY` configured yet — confirm this is a no-op, doesn't crash (fill in `.env.local` per `.env.local.example` and Task 3's project setup to test against a real Supabase project). Create a sale, background the app, check the Supabase Table Editor — the `sales` and `sale_meta_data` rows should appear within a few seconds. Uninstall and reinstall (or clear app data), sign back in — the sale should reappear without re-entering it.

- [ ] **Step 5: Commit**

```bash
git add lib/backupSync/schedule.ts app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(backup): schedule flush/restore on app lifecycle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Manual step outside this plan

Before Task 7's verification step will do anything real, `.env.local` needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` filled in (per `.env.local.example`) against a Supabase project that already has Clerk configured as a third-party auth provider (confirmed already done — see the design spec, §7) and has had Task 3's `supabase/backup_mirror.sql` run against it.
