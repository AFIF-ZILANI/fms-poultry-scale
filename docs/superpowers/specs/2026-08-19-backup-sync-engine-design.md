# Backup Sync Engine — Design Spec

Status: approved, ready for implementation planning
Scope: local SQLite → Supabase Postgres one-way backup sync + restore-on-reinstall.

Explicitly OUT of scope for this spec (separate, later work):
- Google Drive export (personal, user-owned backup copy)
- Community analytics dataset / ETL (star schema, consent, pseudonymization)
- Multi-device concurrent editing / conflict resolution

---

## 1. Background

The app already has the product decisions this depends on, just not the plumbing:

- `db/schema.ts` already splits data into personal (`users`, `userPrefs`) and sales (`batches`, `sales`, `saleMetaData`, `measurementRows`, `rowEditHistory`) tables.
- `users.subscriptionPlan` (`"community" | "premium"`) already exists, with onboarding/profile copy already describing community as data-sharing (free) vs premium as private (paid) — but premium is currently a disabled placeholder in the UI.
- `@supabase/supabase-js` is already wired up with a Clerk-authenticated client (`hooks/useSupabase.ts`, `lib/supabase.ts`), and the Supabase project already has Clerk configured as a third-party auth provider (RLS can reference the Clerk user id today). None of this is used for actual data storage yet.

This spec covers only the sync engine: keeping a Supabase mirror of the local SQLite tables current, so a user's data survives an app reinstall or a new device, per user, regardless of subscription plan. Whether that data later feeds a shared community dataset is a separate, downstream concern (a consent-gated ETL job reading this mirror) — not something the sync engine needs to know about.

## 2. Goals

- Local SQLite stays the single source of truth on-device (no bidirectional conflict resolution).
- Every write reaches Supabase eventually, without instrumenting every call site by hand.
- Repeated edits to the same row collapse into a single sync operation, not one per edit.
- A reinstall / new device restores the user's last synced state automatically.
- Sync failures (offline, request errors) retry without special backoff logic.

## 3. Architecture

```
Local SQLite (source of truth)
  ├─ AFTER INSERT/UPDATE/DELETE triggers on synced tables
  │     → write dirty-marker rows into data_backup_queue
  │
  └─ Sync flush (debounced, or on background/foreground/reconnect)
        → reads queue, batches by table, upserts current row state to Supabase
        → deletes queue rows only after confirmed success

Supabase Postgres (mirror, push-only from the app)
  ├─ One table per synced local table, same shape, RLS scoped to Clerk user id
  ├─ FK cascade rules mirror the local schema (a parent delete cascades
  │  remotely too — no need to queue every cascaded child row separately)
  └─ Consumed later by a separate ETL job for the analytics dataset (not
     this system's concern)
```

Synced tables: `users`, `userPrefs`, `batches`, `sales`, `saleMetaData`, `measurementRows`, `rowEditHistory` — all of them, uniformly. No special-casing personal vs. sales data at this layer; that distinction only matters to the downstream analytics ETL's consent filtering.

## 4. Local schema addition

```ts
export const dataBackupQueue = sqliteTable("data_backup_queue", {
  tableName: text("table_name").notNull(),
  rowId: text("row_id").notNull(),
  op: text("op", { enum: ["upsert", "delete"] }).notNull(),
  queuedAt: integer("queued_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.tableName, table.rowId] }),
}));
```

Primary key on `(tableName, rowId)` is the whole optimization for repeated edits: a trigger firing multiple times on one row does `INSERT ... ON CONFLICT (table_name, row_id) DO UPDATE SET op = excluded.op, queued_at = excluded.queued_at`. One queue row no matter how many edits; flush reads the row's *current* state fresh from its table, not an accumulated diff.

## 5. Queue population — SQLite triggers, not app code

Every synced table gets `AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE` triggers that write into `data_backup_queue`. This is deliberate over instrumenting each write call site in `lib/storage.ts`: a trigger catches every write regardless of code path, so a future write site can't silently skip backup by forgetting to queue itself.

Delete triggers record `op = 'delete'`. Insert/update triggers record `op = 'upsert'`.

## 6. Sync flush

**Trigger conditions** (any of):
- Debounce: ~5-10s after local writes go quiet.
- App transitions to background.
- Network comes back online after being offline.

**Flush procedure:**
1. Read all rows from `data_backup_queue`, group by `tableName`.
2. For `op = 'upsert'` rows: read the current row state from the local table (by id), batch-upsert into the matching Supabase table.
3. For `op = 'delete'` rows: batch-delete by id from the matching Supabase table. Postgres FK cascade rules mirror the local schema, so a cascaded local delete (e.g. a sale deletion cascading to `saleMetaData`/`measurementRows`) only needs the root delete queued — Postgres cascades the rest remotely.
4. On success, delete the flushed rows from `data_backup_queue`.
5. On failure (offline, request error), leave the queue rows in place. The next debounce/background/reconnect trigger retries automatically — no exponential backoff or manual retry logic needed.

## 7. Remote schema (Supabase Postgres)

One table per synced local table, same columns, matching FK cascade rules. RLS on every table scoped to the Clerk user id via the JWT (already configured — no new Supabase dashboard setup required).

## 8. Restore on reinstall / new device

On app start: if the user is signed in via Clerk but local `sales` and `batches` are empty, treat it as a restore case — pull the latest rows down from Supabase into local SQLite once, then resume normal push-only operation. A genuinely new user also has an empty local DB; pulling zero rows for them is a harmless no-op.

## 9. Explicitly out of scope

- **Conflict resolution / multi-device concurrent editing** — not needed; local SQLite is always the source of truth on the device it's used from.
- **Google Drive export** — a separate, user-owned backup copy, later spec.
- **Community analytics dataset / ETL** — consent filtering, pseudonymization (`farmer_id_map`), and the star schema are a downstream job reading this mirror; this spec doesn't implement or design that job.
- **`subscriptionPlan` gating at the sync layer** — sync backs up all users regardless of plan; premium vs. community only affects whether the (separate, future) ETL job includes a user's data in the shared dataset.
