# Community Analytics Dataset — Design Spec

Status: approved, ready for implementation planning
Scope: the star-schema Postgres store on Supabase (`farm_profile` /
`batch_profile` / `sale_event`), pseudonymization, and the local pipeline
that pushes a finished community-plan sale into it.

Explicitly OUT of scope for this spec:
- Any consumption of this dataset (dashboards, price-benchmarking UI shown
  back to users, ML training jobs). This spec only gets clean data into the
  store; what reads it later is separate, future work.
- A UI for the still-orphaned `users.breed` profile field — unrelated,
  stays as-is.
- Any change to how the community/premium plan is chosen or displayed.
- Backfilling historical sales into the dataset — only sales finished after
  this ships get pushed.

---

## 1. Background

This is the third and final sub-project preparing the app's future
community analytics dataset, following two already-shipped prerequisites:

- `docs/superpowers/specs/2026-08-21-structured-location-fields-design.md`
  — `users.districtId`/`upazilaId`, backed by a vendored Bangladesh
  admin-boundary reference at `lib/regions/bd-regions.json`, explicitly
  designed as the single source of truth for a future Postgres reference
  table with matching IDs.
- `docs/superpowers/specs/2026-08-21-batch-sale-operational-fields-design.md`
  — `batches.breed`/`placementDate`/`initialBirdCount`,
  `saleMetaData.buyerType`.

Every field the star schema needs now exists locally. This spec is the
pipeline that gets it — pseudonymized, filtered to community-plan users —
into a Supabase Postgres store separate from and unrelated to any user's
personal Google Drive backup.

**A prerequisite this spec also handles:** Supabase currently still has the
empty leftover tables (`users`, `batches`, `sales`, `sale_meta_data`,
`measurement_rows`, `row_edit_history`, `user_prefs`) from the backup-mirror
engine removed in the Drive-backup migration — the *code* that wrote to
them was deleted, but the tables themselves were never dropped, and there
is currently no tracked Supabase migration history in this repo at all
(confirmed via `supabase migration list`: zero migrations, despite tables
existing — whatever created them bypassed the CLI). This spec establishes
`supabase/migrations/` for the first time and its first migration drops
those tables before anything new is added to the same project.

## 2. Goals

- A finished sale, for a community-plan user, reaches the analytics store
  automatically, without any user-visible step or indicator.
- The real Clerk user id never appears in the analytics store, in any log
  the store's operators can see, or in any table anywhere — pseudonymized
  via a deterministic, non-reversible-without-the-secret transform.
- A push failure (offline, server error) doesn't lose the sale — it
  retries, the same way the existing Drive-backup queue does.
- A user switching from community to premium doesn't retroactively remove
  sales already pushed while they were community — only future sales stop.
- Supabase migrations for this project are tracked in git from this point
  forward.

## 3. Pseudonymization

`farmer_id = HMAC-SHA256(userId, PUSH_SECRET)`, computed server-side inside
the push Edge Function, hex-encoded. `PUSH_SECRET` is a Supabase Edge
Function secret (`Deno.env.get(...)`), set once via the Supabase CLI/
dashboard, never present in any client bundle.

No mapping table exists anywhere — deterministic means nothing needs
storing. The same `userId` always produces the same `farmer_id`, so a
farmer's sales correlate correctly in `farm_profile`/`batch_profile`
without ever persisting the real id. A future account-deletion request
recomputes the same HMAC from the known `userId` and deletes matching
`farm_profile`/`batch_profile`/`sale_event` rows (cascade via FK) — no
lookup needed. This is a stronger form of "the mapping lives only in the
operational system" than a stored map would be: there is no mapping to
leak, compromise, or keep in sync.

## 4. Postgres schema

```sql
-- ============================================================
-- PoultryScale Community Dataset — Analytics / Training Store
-- Postgres, on Supabase. Separate from the app's operational SQLite DB
-- and from any user's personal Google Drive backup.
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────

CREATE TYPE breed_enum AS ENUM (
  'cobb_500', 'ross_308', 'hubbard', 'sonali', 'deshi', 'other'
);

CREATE TYPE capacity_tier_enum AS ENUM (
  'lt_500', '500_2000', '2000_5000', 'gt_5000'
);

CREATE TYPE sale_phase_enum AS ENUM ('main', 'cull');

CREATE TYPE buyer_type_enum AS ENUM ('wholesaler', 'retail', 'direct');

-- ─── Administrative boundary reference tables ───────────────
-- Seeded once from lib/regions/bd-regions.json (the same file the local
-- app bundles) — see §6. IDs match exactly between local and Postgres by
-- construction; never hand-typed or re-derived independently here.

CREATE TABLE divisions (
  id      TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_bn TEXT NOT NULL
);

CREATE TABLE districts (
  id          TEXT PRIMARY KEY,
  division_id TEXT NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
  name_en     TEXT NOT NULL,
  name_bn     TEXT NOT NULL
);
CREATE INDEX districts_division_id_idx ON districts(division_id);

CREATE TABLE upazilas (
  id          TEXT PRIMARY KEY,
  district_id TEXT NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  name_en     TEXT NOT NULL,
  name_bn     TEXT NOT NULL
);
CREATE INDEX upazilas_district_id_idx ON upazilas(district_id);

-- ─── farm_profile (dimension, one row per farmer) ───────────
-- Upserted on every push with the farmer's CURRENT values — sale_event
-- keeps its own location snapshot separately (see below), so this table
-- drifting to a farmer's latest known state does not corrupt history.

CREATE TABLE farm_profile (
  farmer_id     TEXT PRIMARY KEY, -- HMAC-SHA256(userId, PUSH_SECRET), hex
  upazila_id    TEXT NOT NULL REFERENCES upazilas(id) ON DELETE RESTRICT,
  district_id   TEXT NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  capacity_tier capacity_tier_enum,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX farm_profile_upazila_id_idx ON farm_profile(upazila_id);

-- ─── batch_profile (dimension, one row per flock) ───────────

CREATE TABLE batch_profile (
  batch_id           TEXT PRIMARY KEY, -- the local batch's own id
  farmer_id          TEXT NOT NULL REFERENCES farm_profile(farmer_id) ON DELETE CASCADE,
  breed              breed_enum,
  initial_bird_count INTEGER CHECK (initial_bird_count IS NULL OR initial_bird_count > 0),
  placement_date     DATE,
  mortality_count    INTEGER,  -- not collected in v1, always NULL
  feed_consumed_kg   NUMERIC,  -- not collected in v1, always NULL
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX batch_profile_farmer_id_idx ON batch_profile(farmer_id);

COMMENT ON COLUMN batch_profile.mortality_count IS
  'Not collected in v1. Do not treat NULL as zero in any mortality-rate calculation.';
COMMENT ON COLUMN batch_profile.feed_consumed_kg IS
  'Not collected in v1. Do not treat NULL as zero in any FCR calculation.';

-- ─── sale_event (fact, one row per finished community-plan sale) ────
-- Upserted on (sale_id) so a locally-edited-then-repushed sale, or a
-- retried push, is idempotent rather than producing a duplicate.

CREATE TABLE sale_event (
  sale_id                TEXT PRIMARY KEY, -- the local sale's own id
  batch_id               TEXT REFERENCES batch_profile(batch_id) ON DELETE SET NULL,
  farmer_id              TEXT NOT NULL REFERENCES farm_profile(farmer_id) ON DELETE CASCADE,
  upazila_id             TEXT NOT NULL REFERENCES upazilas(id) ON DELETE RESTRICT, -- snapshot as of this sale
  district_id            TEXT NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  breed                  breed_enum, -- denormalized from the batch; NULL for a standalone sale
  age_days_at_sale       INTEGER CHECK (age_days_at_sale IS NULL OR age_days_at_sale > 0), -- NULL if no batch or no placement date
  sale_date              DATE NOT NULL,
  phase                  sale_phase_enum NOT NULL,
  buyer_type             buyer_type_enum,

  birds_sold             INTEGER NOT NULL CHECK (birds_sold > 0),
  avg_weight_kg          NUMERIC NOT NULL,
  total_weight_kg        NUMERIC NOT NULL,
  price_per_kg           NUMERIC NOT NULL,
  total_amount           NUMERIC NOT NULL,

  kg_per_crate           NUMERIC NOT NULL,
  deduction_per_crate_g  NUMERIC NOT NULL,
  total_crates           NUMERIC NOT NULL,
  total_deduction_wt_kg  NUMERIC NOT NULL,

  has_cull_portion       BOOLEAN NOT NULL DEFAULT false,
  cull_weight_kg         NUMERIC,
  cull_price_per_kg      NUMERIC,
  cull_pcs               INTEGER,

  is_pcs_tracked         BOOLEAN NOT NULL, -- data-quality flag, not analytical
  is_full_crates_only    BOOLEAN NOT NULL, -- data-quality flag, not analytical

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sale_event_upazila_date_idx ON sale_event(upazila_id, sale_date);
CREATE INDEX sale_event_breed_date_idx   ON sale_event(breed, sale_date);
CREATE INDEX sale_event_farmer_id_idx    ON sale_event(farmer_id);
CREATE INDEX sale_event_batch_id_idx     ON sale_event(batch_id);
```

`capacity_tier` is computed inside the Edge Function from the raw
`farmCapacity` integer already on `users` locally, with these boundaries
(each tier's own name is its lower bound, inclusive; `null` `farmCapacity`
produces `null` `capacity_tier`):
- `farmCapacity < 500` → `'lt_500'`
- `500 <= farmCapacity < 2000` → `'500_2000'`
- `2000 <= farmCapacity < 5000` → `'2000_5000'`
- `farmCapacity >= 5000` → `'gt_5000'`

These boundaries live in one place (server-side), not duplicated locally.
`age_days_at_sale` is computed the
same way, from the sale's date minus the batch's `placementDate` — `NULL`
when the sale has no batch, or the batch has no `placementDate` set.

## 5. Local queue and trigger

A new `communityPushQueue` table (SQLite, local):

```ts
export const communityPushQueue = sqliteTable("community_push_queue", {
  saleId: text("sale_id").primaryKey().references(() => sales.id, { onDelete: "cascade" }),
  queuedAt: integer("queued_at", { mode: "timestamp" }).notNull(),
});
```

`saveSale` (`lib/storage.ts`) writes `sale_meta_data` via
`.insert(...).onConflictDoUpdate(...)` — a re-save of an already-finished
sale (e.g. the user corrects a buyer name or cull figure afterward) takes
the update path, not the insert path. So this needs **two** triggers, one
`AFTER INSERT` and one `AFTER UPDATE`, both with the same `WHEN` condition
and body — matching the existing dual insert/update pattern already used
for `data_backup_queue` in migration `0012_backup_queue_triggers.sql`
(reference that file directly for the exact syntax convention to copy).
Each fires only when the sale is finished **and** the owning user's
`subscription_plan` is `'community'` at that moment:

```sql
CREATE TRIGGER community_push_enqueue_insert
AFTER INSERT ON sale_meta_data
WHEN (
  SELECT is_finished FROM sales WHERE id = NEW.sale_id
) = 1
AND (
  SELECT subscription_plan FROM users
  WHERE id = (SELECT user_id FROM sales WHERE id = NEW.sale_id)
) = 'community'
BEGIN
  INSERT OR IGNORE INTO community_push_queue (sale_id, queued_at)
  VALUES (NEW.sale_id, CAST(strftime('%s','now') AS INTEGER));
END;
--> statement-breakpoint
CREATE TRIGGER community_push_enqueue_update
AFTER UPDATE ON sale_meta_data
WHEN (
  SELECT is_finished FROM sales WHERE id = NEW.sale_id
) = 1
AND (
  SELECT subscription_plan FROM users
  WHERE id = (SELECT user_id FROM sales WHERE id = NEW.sale_id)
) = 'community'
BEGIN
  INSERT OR IGNORE INTO community_push_queue (sale_id, queued_at)
  VALUES (NEW.sale_id, CAST(strftime('%s','now') AS INTEGER));
END;
```

`INSERT OR IGNORE` means a sale already sitting in the queue (not yet
pushed) is a no-op; a sale already pushed and removed from the queue gets
re-queued by the edit, so the analytics store picks up the correction on
the next flush (the Edge Function's `sale_event` upsert makes this
idempotent either way).

Once a sale is queued, it stays queued regardless of a later plan switch —
the consent was valid at the moment it was queued, matching the "no
retroactive removal" rule in §2. A premium user's sale never enters the
queue in the first place, since each trigger's `WHEN` clause checks the
plan before the insert.

## 6. Push Edge Function

New: `supabase/functions/push-community-sale/index.ts`, reusing
`drive-token`'s exact Clerk-JWT-verification block (JWKS lookup, extract
`sub` as `userId` — see `supabase/functions/drive-token/index.ts` for the
pattern to copy verbatim).

Request body (assembled locally, see §7): the sale's own fields, its
batch's `breed`/`placementDate`/`initialBirdCount` if it has one, and the
user's `districtId`/`upazilaId`/`farmCapacity`.

On a verified request:
1. Compute `farmer_id = HMAC-SHA256(userId, PUSH_SECRET)`.
2. Compute `capacity_tier` from `farmCapacity`.
3. Compute `age_days_at_sale` from `saleDate` and the batch's
   `placementDate` (`null` if either is missing).
4. `INSERT ... ON CONFLICT (farmer_id) DO UPDATE` into `farm_profile`.
5. If the sale has a `batchId`: `INSERT ... ON CONFLICT (batch_id) DO
   UPDATE` into `batch_profile`.
6. `INSERT ... ON CONFLICT (sale_id) DO UPDATE` into `sale_event`.
7. Return `200` on success.

Errors follow `drive-token`'s existing shape: `401` on JWT failure, `400`
on a malformed payload, `500` on a Postgres write failure (logged
server-side, nothing sensitive echoed to the client).

## 7. Local flush mechanism

New `lib/communityPush/` module, structurally parallel to
`lib/driveSync/`:

- `lib/communityPush/push.ts` — reads one queued `sale_id`, assembles the
  payload (join `sales` + `sale_meta_data` + the batch if any + the
  user's location/capacity fields), POSTs to `push-community-sale` with
  the Clerk session token, deletes the queue row only on a `200` response.
- `lib/communityPush/schedule.ts` — a `useCommunityPush(userId)` hook
  mirroring `useDriveSync`'s periodic-tick + AppState-background trigger
  (same interval constant reused, or its own — implementation detail for
  the plan), flushing the whole queue on each trigger. Mounted alongside
  `useDriveSync` in `app/_layout.tsx`.

No user-visible state, no UI, no "last pushed" indicator — this is
invisible background best-effort delivery with reliable local retry, not
a feature the user interacts with.

## 8. Error handling

- Edge Function: `401`/`400`/`500` as in §6, matching `drive-token`'s
  existing conventions exactly.
- Local flush: any non-`200` response (network failure, `4xx`, `5xx`)
  leaves the queue row in place; the next periodic or foreground-trigger
  tick retries it. No exponential backoff for v1 — matches the existing
  Drive-backup queue's simplicity.
- No retry limit or dead-letter handling for v1 — a queue row that never
  succeeds just stays queued indefinitely, retried on every tick. Given
  this is best-effort aggregate data (not the user's own records, which
  are safe locally and in their personal Drive backup regardless), that's
  an acceptable failure mode, not a data-loss risk.

## 9. File structure

- Create: `supabase/migrations/` (new directory, first use in this repo)
  — one migration dropping the legacy backup-mirror tables, one creating
  the community-dataset schema (§4), one seeding the reference tables
  from `lib/regions/bd-regions.json` (generated, not hand-written — see
  the vendoring script pattern already established in
  `scripts/vendor-bd-regions.mjs`)
- Create: `supabase/functions/push-community-sale/index.ts`
- Modify: `db/schema.ts` — add `communityPushQueue`
- Modify: `db/migrations/` — new migration adding the table and the
  enqueue trigger (§5)
- Create: `lib/communityPush/push.ts`, `lib/communityPush/schedule.ts`
- Modify: `app/_layout.tsx` — mount `useCommunityPush` alongside
  `useDriveSync`

## 10. Testing

- Local: unit tests (matching `__tests__/driveApi.test.ts`/
  `__tests__/driveBackup.test.ts`'s existing conventions — real in-memory
  SQLite via `applyMigrations()`/`resetDb()`, mocked HTTP for the push
  itself) covering: the enqueue trigger fires for a finished community
  sale and not for a finished premium sale; a queued sale survives a later
  plan switch to premium; payload assembly produces the correct shape for
  a sale with a batch, a standalone sale (no batch), and a sale whose
  batch has no `placementDate`/`breed`/`initialBirdCount` set; the queue
  row is deleted only on a `200` response and retried otherwise.
- The Edge Function itself gets no automated test coverage in this repo,
  consistent with `drive-token` today — deployed and manually verified,
  not unit-tested.
