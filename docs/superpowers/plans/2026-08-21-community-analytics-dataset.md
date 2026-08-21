# Community Analytics Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the star-schema Postgres store on Supabase and the local
pipeline that pushes a finished community-plan sale into it, pseudonymized
and with reliable retry.

**Architecture:** New Supabase migrations (tracked in git for the first
time in this repo) establish the schema; a new Edge Function
(`push-community-sale`) verifies the caller, computes a deterministic
pseudonymous `farmer_id`, and upserts into it; a local SQLite trigger
enqueues finished community-plan sales into a new queue table, and a
periodic/foreground-triggered flush (mirroring `lib/driveSync`'s existing
pattern) drains it.

**Tech Stack:** Drizzle ORM (`expo-sqlite`) locally, Supabase CLI +
Postgres + Deno Edge Functions remotely, `@supabase/supabase-js` on both
sides, Jest for local tests.

**Spec:** `docs/superpowers/specs/2026-08-21-community-analytics-dataset-design.md`

## Global Constraints

- The real Clerk user id never appears in the analytics store or any log
  visible to its operators — pseudonymized via
  `farmer_id = HMAC-SHA256(userId, PUSH_SECRET)`, computed server-side
  only. No mapping table exists anywhere (spec §3).
- A push failure retries via a local queue (mirroring the existing
  `data_backup_queue` reliability pattern) — no silent data loss, no
  backoff needed for v1 (spec §5, §8).
- A user switching community→premium does not remove already-pushed
  sales — only sales queued after the switch stop being pushed (spec §5).
- **Safety boundary, binding on every task below:** this plan writes
  migration SQL files and the Edge Function's source as git-tracked
  artifacts. It does NOT run `supabase db push` (applies migrations to the
  live linked Supabase project) or `supabase functions deploy` (deploys
  the Edge Function) as part of any task's automated steps — those are
  live changes to a shared, external, already-in-production database and
  require the user's explicit go-ahead outside this task loop. Where a
  task's normal verification would be "run it against the real thing,"
  this plan substitutes `supabase db push --dry-run` (prints what would
  apply, connects read-only, applies nothing) plus careful manual SQL
  review instead. The final task in this plan documents the actual
  deploy/push commands for the user to run by hand when ready — do not
  run them as part of task execution.

---

## Task 1: Drop the legacy backup-mirror tables, establish tracked migrations

**Files:**
- Create: `supabase/migrations/<timestamp>_drop_legacy_backup_mirror.sql`

**Interfaces:**
- Consumes: none
- Produces: nothing consumed by later tasks (this is a standalone cleanup;
  later tasks create fresh tables that don't depend on this one having run
  first, though it should run first for tidiness)

- [ ] **Step 1: Create the migration file**

Run: `supabase migration new drop_legacy_backup_mirror`

This creates an empty, correctly-timestamped file under
`supabase/migrations/`. Note the exact filename it prints — you'll edit
that file next.

- [ ] **Step 2: Write the migration**

Open the new file and write:

```sql
-- Drops the empty leftover tables from the Supabase backup-mirror engine
-- removed by the Google Drive-based personal backup migration
-- (docs/superpowers/specs/2026-08-20-drive-backup-sync-design.md). The
-- code that wrote to these tables was deleted then, but the tables
-- themselves were never dropped, and this project has had zero tracked
-- Supabase migrations until now (confirmed via `supabase migration list`
-- returning an empty array despite these tables existing — whatever
-- created them bypassed the CLI). This is the first tracked migration for
-- this project. Tables are confirmed empty; drop order is leaf-tables
-- first to satisfy foreign key dependencies without needing CASCADE.

DROP TABLE IF EXISTS row_edit_history;
--> statement-breakpoint
DROP TABLE IF EXISTS measurement_rows;
--> statement-breakpoint
DROP TABLE IF EXISTS sale_meta_data;
--> statement-breakpoint
DROP TABLE IF EXISTS sales;
--> statement-breakpoint
DROP TABLE IF EXISTS batches;
--> statement-breakpoint
DROP TABLE IF EXISTS user_prefs;
--> statement-breakpoint
DROP TABLE IF EXISTS users;
```

- [ ] **Step 3: Validate without applying**

Run: `supabase db push --dry-run`
Expected: it connects to the linked remote project and prints that this
migration would be applied — it does NOT actually run the `DROP TABLE`
statements. Read the output carefully; if it reports any table as
non-empty or the command errors, STOP and report back rather than
guessing — the user said these tables are empty, but this is the one
place in the whole plan that reads live production state, so surface
anything unexpected instead of proceeding.

Do NOT run `supabase db push` (without `--dry-run`) — that actually
applies it. This task's deliverable is the committed SQL file plus a
clean dry-run; actual application happens later, by the user, per this
plan's Global Constraints.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "chore(supabase): drop legacy backup-mirror tables, add first tracked migration"
```

---

## Task 2: Community dataset schema migration

**Files:**
- Create: `supabase/migrations/<timestamp>_community_dataset_schema.sql`

**Interfaces:**
- Consumes: none
- Produces: Postgres tables `divisions`, `districts`, `upazilas`,
  `farm_profile`, `batch_profile`, `sale_event` (all consumed by Task 3
  [reference tables only] and Task 4 [all of them, via upserts])

- [ ] **Step 1: Create the migration file**

Run: `supabase migration new community_dataset_schema`

- [ ] **Step 2: Write the migration**

Open the new file and write exactly this (copied from the spec, with the
`birds_sold`/`avg_weight_kg` nullability fix already applied — both are
`NULL` for a weight-only, non-pcs-tracked sale, since the local
`saleMetaData.totalPcs`/`avgWtGrams` are themselves nullable for that
case):

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
--> statement-breakpoint

CREATE TYPE capacity_tier_enum AS ENUM (
  'lt_500', '500_2000', '2000_5000', 'gt_5000'
);
--> statement-breakpoint

CREATE TYPE sale_phase_enum AS ENUM ('main', 'cull');
--> statement-breakpoint

CREATE TYPE buyer_type_enum AS ENUM ('wholesaler', 'retail', 'direct');
--> statement-breakpoint

-- ─── Administrative boundary reference tables ───────────────
-- Seeded in a later migration (Task 3) from lib/regions/bd-regions.json —
-- the same file the local app bundles. IDs match exactly by construction.

CREATE TABLE divisions (
  id      TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_bn TEXT NOT NULL
);
--> statement-breakpoint

CREATE TABLE districts (
  id          TEXT PRIMARY KEY,
  division_id TEXT NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
  name_en     TEXT NOT NULL,
  name_bn     TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX districts_division_id_idx ON districts(division_id);
--> statement-breakpoint

CREATE TABLE upazilas (
  id          TEXT PRIMARY KEY,
  district_id TEXT NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  name_en     TEXT NOT NULL,
  name_bn     TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX upazilas_district_id_idx ON upazilas(district_id);
--> statement-breakpoint

-- ─── farm_profile (dimension, one row per farmer) ───────────
-- Upserted on every push with the farmer's CURRENT values.

CREATE TABLE farm_profile (
  farmer_id     TEXT PRIMARY KEY, -- HMAC-SHA256(userId, PUSH_SECRET), hex
  upazila_id    TEXT NOT NULL REFERENCES upazilas(id) ON DELETE RESTRICT,
  district_id   TEXT NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  capacity_tier capacity_tier_enum,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX farm_profile_upazila_id_idx ON farm_profile(upazila_id);
--> statement-breakpoint

-- ─── batch_profile (dimension, one row per flock) ───────────

CREATE TABLE batch_profile (
  batch_id           TEXT PRIMARY KEY,
  farmer_id          TEXT NOT NULL REFERENCES farm_profile(farmer_id) ON DELETE CASCADE,
  breed              breed_enum,
  initial_bird_count INTEGER CHECK (initial_bird_count IS NULL OR initial_bird_count > 0),
  placement_date     DATE,
  mortality_count    INTEGER,  -- not collected in v1, always NULL
  feed_consumed_kg   NUMERIC,  -- not collected in v1, always NULL
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX batch_profile_farmer_id_idx ON batch_profile(farmer_id);
--> statement-breakpoint

COMMENT ON COLUMN batch_profile.mortality_count IS
  'Not collected in v1. Do not treat NULL as zero in any mortality-rate calculation.';
--> statement-breakpoint
COMMENT ON COLUMN batch_profile.feed_consumed_kg IS
  'Not collected in v1. Do not treat NULL as zero in any FCR calculation.';
--> statement-breakpoint

-- ─── sale_event (fact, one row per finished community-plan sale) ────
-- Upserted on (sale_id) so a locally-edited-then-repushed sale, or a
-- retried push, is idempotent rather than producing a duplicate.

CREATE TABLE sale_event (
  sale_id                TEXT PRIMARY KEY,
  batch_id               TEXT REFERENCES batch_profile(batch_id) ON DELETE SET NULL,
  farmer_id              TEXT NOT NULL REFERENCES farm_profile(farmer_id) ON DELETE CASCADE,
  upazila_id             TEXT NOT NULL REFERENCES upazilas(id) ON DELETE RESTRICT,
  district_id            TEXT NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  breed                  breed_enum,
  age_days_at_sale       INTEGER CHECK (age_days_at_sale IS NULL OR age_days_at_sale > 0),
  sale_date              DATE NOT NULL,
  phase                  sale_phase_enum NOT NULL,
  buyer_type             buyer_type_enum,

  birds_sold             INTEGER CHECK (birds_sold IS NULL OR birds_sold > 0),
  avg_weight_kg          NUMERIC,
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

  is_pcs_tracked         BOOLEAN NOT NULL,
  is_full_crates_only    BOOLEAN NOT NULL,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX sale_event_upazila_date_idx ON sale_event(upazila_id, sale_date);
--> statement-breakpoint
CREATE INDEX sale_event_breed_date_idx   ON sale_event(breed, sale_date);
--> statement-breakpoint
CREATE INDEX sale_event_farmer_id_idx    ON sale_event(farmer_id);
--> statement-breakpoint
CREATE INDEX sale_event_batch_id_idx     ON sale_event(batch_id);
--> statement-breakpoint

COMMENT ON COLUMN sale_event.birds_sold IS
  'NULL for a weight-only sale (is_pcs_tracked = false) — the local app never records a bird count for those.';
--> statement-breakpoint
COMMENT ON COLUMN sale_event.avg_weight_kg IS
  'NULL for a weight-only sale (is_pcs_tracked = false) — same reason as birds_sold.';
```

- [ ] **Step 3: Validate without applying**

Run: `supabase db push --dry-run`
Expected: prints that this migration (stacked after Task 1's) would be
applied, no errors. Does not apply anything.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(supabase): add community analytics dataset schema"
```

---

## Task 3: Seed the reference tables from lib/regions/bd-regions.json

**Files:**
- Create: `scripts/generate-region-seed.mjs`
- Create: `supabase/migrations/<timestamp>_seed_regions.sql` (generated,
  not hand-written)
- Test: `__tests__/regionSeed.test.ts`

**Interfaces:**
- Consumes: `lib/regions/bd-regions.json` (from the already-shipped
  structured-location-fields sub-project — `{ divisions: [{id, nameEn,
  nameBn}], districts: [{id, divisionId, nameEn, nameBn}], upazilas:
  [{id, districtId, nameEn, nameBn}] }`)
- Produces: seed data for the `divisions`/`districts`/`upazilas` tables
  Task 2 created (consumed by Task 4's `farm_profile`/`sale_event`
  foreign keys once actually applied)

- [ ] **Step 1: Write the generator script**

Create `scripts/generate-region-seed.mjs`:

```js
// Generates supabase/migrations/<timestamp>_seed_regions.sql from
// lib/regions/bd-regions.json — the same file the local app bundles.
// Re-run this (with a fresh `supabase migration new seed_regions` output
// path as the argument) if bd-regions.json is ever re-vendored; do not
// hand-edit the generated SQL file.
import fs from "fs";
import data from "../lib/regions/bd-regions.json" with { type: "json" };

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

const outPath = process.argv[2];
if (!outPath) {
  console.error("Usage: node scripts/generate-region-seed.mjs <output-sql-path>");
  process.exit(1);
}

const lines = [
  "-- Generated by scripts/generate-region-seed.mjs from lib/regions/bd-regions.json.",
  "-- Do not hand-edit — re-run the generator against a fresh migration file instead.",
  "",
];

for (const d of data.divisions) {
  lines.push(
    `INSERT INTO divisions (id, name_en, name_bn) VALUES ('${sqlEscape(d.id)}', '${sqlEscape(d.nameEn)}', '${sqlEscape(d.nameBn)}');`,
  );
}
for (const d of data.districts) {
  lines.push(
    `INSERT INTO districts (id, division_id, name_en, name_bn) VALUES ('${sqlEscape(d.id)}', '${sqlEscape(d.divisionId)}', '${sqlEscape(d.nameEn)}', '${sqlEscape(d.nameBn)}');`,
  );
}
for (const u of data.upazilas) {
  lines.push(
    `INSERT INTO upazilas (id, district_id, name_en, name_bn) VALUES ('${sqlEscape(u.id)}', '${sqlEscape(u.districtId)}', '${sqlEscape(u.nameEn)}', '${sqlEscape(u.nameBn)}');`,
  );
}

fs.writeFileSync(outPath, lines.join("\n") + "\n");
console.log(
  `Wrote ${data.divisions.length} divisions, ${data.districts.length} districts, ${data.upazilas.length} upazilas to ${outPath}`,
);
```

- [ ] **Step 2: Generate the migration**

Run: `supabase migration new seed_regions` — note the exact path it
prints (it creates an empty file; you'll overwrite it in the next step).

Run: `node scripts/generate-region-seed.mjs <the path from the previous command>`
Expected output: `Wrote 8 divisions, 64 districts, 494 upazilas to <path>`

- [ ] **Step 3: Write the failing test**

Create `__tests__/regionSeed.test.ts`:

```ts
import fs from "fs";
import path from "path";
import data from "../lib/regions/bd-regions.json";

function findSeedMigration(): string {
  const dir = path.join(__dirname, "../supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.includes("seed_regions"));
  if (files.length !== 1) {
    throw new Error(`Expected exactly one seed_regions migration, found ${files.length}`);
  }
  return fs.readFileSync(path.join(dir, files[0]), "utf8");
}

describe("region seed migration", () => {
  it("has one INSERT per division, district, and upazila", () => {
    const sql = findSeedMigration();
    const divisionInserts = sql.match(/INSERT INTO divisions/g) ?? [];
    const districtInserts = sql.match(/INSERT INTO districts/g) ?? [];
    const upazilaInserts = sql.match(/INSERT INTO upazilas/g) ?? [];
    expect(divisionInserts.length).toBe(data.divisions.length);
    expect(districtInserts.length).toBe(data.districts.length);
    expect(upazilaInserts.length).toBe(data.upazilas.length);
  });

  it("includes a specific known district's insert with matching name", () => {
    const sql = findSeedMigration();
    const [firstDistrict] = data.districts;
    expect(sql).toContain(
      `('${firstDistrict.id}', '${firstDistrict.divisionId}', '${firstDistrict.nameEn}', '${firstDistrict.nameBn}')`,
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/regionSeed.test.ts`
Expected: PASS (the migration was already generated in Step 2, so this
test should pass immediately — it exists to catch drift if the seed is
ever regenerated incorrectly, not to drive new code).

- [ ] **Step 5: Validate without applying**

Run: `supabase db push --dry-run`
Expected: prints that this migration (stacked after Task 1 and Task 2's)
would be applied, no errors. Does not apply anything.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-region-seed.mjs supabase/migrations/ __tests__/regionSeed.test.ts
git commit -m "feat(supabase): seed region reference tables from lib/regions/bd-regions.json"
```

---

## Task 4: push-community-sale Edge Function

**Files:**
- Create: `supabase/functions/push-community-sale/index.ts`

**Interfaces:**
- Consumes: `divisions`/`districts`/`upazilas`/`farm_profile`/
  `batch_profile`/`sale_event` tables (Task 2); the request payload shape
  produced by Task 6's `assembleCommunityPushPayload`
- Produces: an HTTP endpoint (invoked via
  `supabase.functions.invoke("push-community-sale", { body })`, consumed
  by Task 6) accepting the payload below and returning `{ ok: true }` on
  success

- [ ] **Step 1: Write the Edge Function**

Create `supabase/functions/push-community-sale/index.ts`:

```ts
// Pushes one finished community-plan sale into the analytics dataset.
// Runs server-side only — PUSH_SECRET (for pseudonymization) and the
// Postgres service role key never reach the client.
//
// The Clerk-JWT-verification block below is deliberately duplicated from
// supabase/functions/drive-token/index.ts rather than factored into a
// shared module: each Edge Function deploys and cold-starts
// independently, this is the only other place that needs it, and the two
// call sites' verification logic is unlikely to diverge — see that
// file's own comments for the full rationale behind verifying against
// Clerk's JWKS directly instead of Supabase's /auth/v1/user.

import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CLERK_PUBLISHABLE_KEY = "pk_test_dW5pcXVlLW1hcm1vc2V0LTEwLmNsZXJrLmFjY291bnRzLmRldiQ";

function clerkJwksUrl(publishableKey: string): string {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  const domain = atob(encoded).replace(/\$$/, "");
  return `https://${domain}/.well-known/jwks.json`;
}

const clerkJwks = createRemoteJWKSet(new URL(clerkJwksUrl(CLERK_PUBLISHABLE_KEY)));

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically
// to every Edge Function by the platform — no manual secret needed for
// these two. The service role key bypasses RLS, which is intentional
// here: this function is the only writer to these tables, and it has
// already verified the caller via the Clerk JWT above.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Breed = "cobb_500" | "ross_308" | "hubbard" | "sonali" | "deshi" | "other";
type BuyerType = "wholesaler" | "retail" | "direct";

interface PushPayload {
  saleId: string;
  batchId: string | null;
  saleDate: string; // "YYYY-MM-DD"
  phase: "main" | "cull";
  buyerType: BuyerType | null;
  birdsSold: number | null;
  avgWeightKg: number | null;
  totalWeightKg: number;
  pricePerKg: number;
  totalAmount: number;
  kgPerCrate: number;
  deductionPerCrateG: number;
  totalCrates: number;
  totalDeductionWtKg: number;
  hasCullPortion: boolean;
  cullWeightKg: number | null;
  cullPricePerKg: number | null;
  cullPcs: number | null;
  isPcsTracked: boolean;
  isFullCratesOnly: boolean;
  breed: Breed | null;
  placementDate: string | null; // "YYYY-MM-DD", from the batch
  initialBirdCount: number | null;
  districtId: string;
  upazilaId: string;
  farmCapacity: number | null;
}

function capacityTier(farmCapacity: number | null): string | null {
  if (farmCapacity == null) return null;
  if (farmCapacity < 500) return "lt_500";
  if (farmCapacity < 2000) return "500_2000";
  if (farmCapacity < 5000) return "2000_5000";
  return "gt_5000";
}

function ageDaysAtSale(saleDate: string, placementDate: string | null): number | null {
  if (!placementDate) return null;
  const saleMs = new Date(saleDate).getTime();
  const placementMs = new Date(placementDate).getTime();
  const days = Math.round((saleMs - placementMs) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : null;
}

async function hmacFarmerId(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  console.log("[push-community-sale] request received");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("[push-community-sale] rejected: missing or malformed Authorization header");
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }
  const sessionToken = authHeader.slice("Bearer ".length);

  let clerkUserId: string;
  try {
    const { payload } = await jwtVerify(sessionToken, clerkJwks);
    if (typeof payload.sub !== "string") {
      throw new Error("token has no sub claim");
    }
    clerkUserId = payload.sub;
  } catch (err) {
    console.warn("[push-community-sale] rejected: Clerk JWT verification failed", err);
    return jsonResponse({ error: "Invalid session" }, 401);
  }

  let body: PushPayload;
  try {
    body = await req.json();
  } catch {
    console.warn("[push-community-sale] rejected: malformed JSON body");
    return jsonResponse({ error: "Malformed JSON body" }, 400);
  }
  if (!body.saleId || !body.saleDate || !body.districtId || !body.upazilaId) {
    console.warn("[push-community-sale] rejected: missing required fields");
    return jsonResponse({ error: "Missing required fields" }, 400);
  }

  const pushSecret = Deno.env.get("PUSH_SECRET")!;
  const farmerId = await hmacFarmerId(clerkUserId, pushSecret);
  console.log("[push-community-sale] verified caller, farmer_id computed");

  const { error: farmError } = await supabase.from("farm_profile").upsert({
    farmer_id: farmerId,
    upazila_id: body.upazilaId,
    district_id: body.districtId,
    capacity_tier: capacityTier(body.farmCapacity),
  });
  if (farmError) {
    console.warn("[push-community-sale] farm_profile upsert failed", farmError);
    return jsonResponse({ error: "Database write failed" }, 500);
  }

  if (body.batchId) {
    const { error: batchError } = await supabase.from("batch_profile").upsert({
      batch_id: body.batchId,
      farmer_id: farmerId,
      breed: body.breed,
      initial_bird_count: body.initialBirdCount,
      placement_date: body.placementDate,
    });
    if (batchError) {
      console.warn("[push-community-sale] batch_profile upsert failed", batchError);
      return jsonResponse({ error: "Database write failed" }, 500);
    }
  }

  const { error: saleError } = await supabase.from("sale_event").upsert({
    sale_id: body.saleId,
    batch_id: body.batchId,
    farmer_id: farmerId,
    upazila_id: body.upazilaId,
    district_id: body.districtId,
    breed: body.breed,
    age_days_at_sale: ageDaysAtSale(body.saleDate, body.placementDate),
    sale_date: body.saleDate,
    phase: body.phase,
    buyer_type: body.buyerType,
    birds_sold: body.birdsSold,
    avg_weight_kg: body.avgWeightKg,
    total_weight_kg: body.totalWeightKg,
    price_per_kg: body.pricePerKg,
    total_amount: body.totalAmount,
    kg_per_crate: body.kgPerCrate,
    deduction_per_crate_g: body.deductionPerCrateG,
    total_crates: body.totalCrates,
    total_deduction_wt_kg: body.totalDeductionWtKg,
    has_cull_portion: body.hasCullPortion,
    cull_weight_kg: body.cullWeightKg,
    cull_price_per_kg: body.cullPricePerKg,
    cull_pcs: body.cullPcs,
    is_pcs_tracked: body.isPcsTracked,
    is_full_crates_only: body.isFullCratesOnly,
  });
  if (saleError) {
    console.warn("[push-community-sale] sale_event upsert failed", saleError);
    return jsonResponse({ error: "Database write failed" }, 500);
  }

  console.log(`[push-community-sale] pushed sale ${body.saleId}`);
  return jsonResponse({ ok: true }, 200);
});
```

- [ ] **Step 2: Review against the existing proven pattern**

There is no Deno CLI or Docker available in this environment to run or
type-check this function directly (confirmed: `deno --version` and
`supabase db dump` both fail here). Verification for this task is a
careful manual read-through, not an executed test:

- Compare the Authorization-header/JWT-verification block (lines through
  `clerkUserId = payload.sub;` and its catch block) line-by-line against
  `supabase/functions/drive-token/index.ts`'s equivalent block — they
  should match except for the log-prefix string (`[push-community-sale]`
  vs `[drive-token]`) and the absence of `drive-token`'s
  Google-token-minting logic afterward, which does not apply here.
- Confirm every field referenced in the three `.upsert()` calls
  (`farm_profile`, `batch_profile`, `sale_event`) has a matching column
  in Task 2's migration, by name and by nullability (the `PushPayload`
  interface's `| null` fields must line up with the migration's nullable
  columns — `birds_sold`, `avg_weight_kg`, `breed`, `buyer_type`,
  `batch_id`, `age_days_at_sale`, and everything in the `cull_*` group).
- Confirm `batch_profile` is only upserted `if (body.batchId)` — a
  standalone sale (no batch) must not attempt a `batch_profile` write
  with a null `batch_id` (that table's PK is `NOT NULL` implicitly via
  `PRIMARY KEY`).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/push-community-sale/
git commit -m "feat(supabase): add push-community-sale Edge Function"
```

Note for the user (not a task step — see this plan's final task): this
function needs a `PUSH_SECRET` value set via
`supabase secrets set PUSH_SECRET=<a long random value>` before it can
run for real. Generating and setting that secret is a one-time manual
step, not something to automate here.

---

## Task 5: communityPushQueue table and enqueue triggers

**Files:**
- Modify: `db/schema.ts`
- Create: `db/migrations/00XX_<generated-name>.sql` (auto-generated for
  the table) — the trigger SQL is added as a second, hand-written
  migration (Drizzle Kit doesn't generate triggers)
- Test: `__tests__/communityPush.test.ts`

**Interfaces:**
- Consumes: `sales`, `saleMetaData`, `users` tables (existing)
- Produces: `communityPushQueue` table
  (`{ saleId: string, queuedAt: Date }`, Drizzle-inferred, consumed by
  Task 6)

- [ ] **Step 1: Add the table to the schema**

In `db/schema.ts`, add this new table definition right after the existing
`dataBackupQueue` table:

```ts
// ─── Community Push Queue ───
// Populated entirely by triggers (see migration below) — never written
// to directly from app code, matching data_backup_queue's own pattern.
// One row per finished community-plan sale not yet pushed to the
// analytics dataset.
export const communityPushQueue = sqliteTable("community_push_queue", {
  saleId: text("sale_id")
    .primaryKey()
    .references(() => sales.id, { onDelete: "cascade" }),
  queuedAt: integer("queued_at", { mode: "timestamp" }).notNull(),
});
```

- [ ] **Step 2: Generate the migration for the table**

Run: `npx drizzle-kit generate`

This creates a new `db/migrations/00XX_<random-name>.sql` containing a
`CREATE TABLE community_push_queue (...)` statement, updates
`db/migrations/meta/_journal.json`, adds a new
`db/migrations/meta/00XX_snapshot.json`, and regenerates
`db/migrations/migrations.js`. Note the generated filename.

- [ ] **Step 3: Verify the generated migration**

Read the new file — expect one `CREATE TABLE community_push_queue` (or
equivalent `sqlite` DDL) statement matching the schema above, referencing
`sales(id)` with `ON DELETE CASCADE`.

- [ ] **Step 4: Write the failing test**

Create `__tests__/communityPush.test.ts`:

```ts
import { db } from "../db/client";
import { users, batches, communityPushQueue } from "../db/schema";
import { saveSale } from "../lib/storage";
import type { MeasurementRow, SaleMetaData, SaleRecord } from "../lib/types";
import { applyMigrations, resetDb } from "./helpers/db";
import { eq } from "drizzle-orm";

beforeAll(() => applyMigrations());

beforeEach(async () => {
  resetDb();
  await db.insert(users).values([
    { id: "community-user", subscriptionPlan: "community" },
    { id: "premium-user", subscriptionPlan: "premium" },
  ]);
});

function makeRow(o: Partial<MeasurementRow> = {}): MeasurementRow {
  return { id: "r1", weightKg: 2, pcs: 4, timestamp: 1_000, ...o };
}

function makeMeta(o: Partial<SaleMetaData> = {}): SaleMetaData {
  return {
    mainWeightKg: 10,
    kgPerCrate: 2,
    deductionPerCrateG: 200,
    isFullCratesOnly: false,
    mainPrice: 100,
    mainAmount: 900,
    cullWeightKg: 0,
    finalAmount: 900,
    receivedAmount: 0,
    totalDeductionWtKg: 1,
    netWeightKg: 9,
    totalCrates: 5,
    createdAt: 1_000,
    ...o,
  };
}

function makeSale(o: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: "sale-1",
    userId: "community-user",
    phase: "main",
    isPcsTracked: true,
    hasCull: false,
    isFinished: true,
    rows: [makeRow()],
    createdAt: 1_000,
    updatedAt: 1_000,
    meta: makeMeta(),
    ...o,
  };
}

async function queuedSaleIds(): Promise<string[]> {
  const rows = await db.select().from(communityPushQueue);
  return rows.map((r) => r.saleId);
}

describe("community push queue", () => {
  it("queues a finished sale for a community-plan user", async () => {
    await saveSale("community-user", makeSale());
    expect(await queuedSaleIds()).toEqual(["sale-1"]);
  });

  it("does not queue a finished sale for a premium-plan user", async () => {
    await saveSale("premium-user", makeSale({ userId: "premium-user" }));
    expect(await queuedSaleIds()).toEqual([]);
  });

  it("does not queue an unfinished (draft) sale", async () => {
    await saveSale("community-user", makeSale({ isFinished: false, meta: undefined }));
    expect(await queuedSaleIds()).toEqual([]);
  });

  it("re-queues an already-pushed sale when it is edited again", async () => {
    await saveSale("community-user", makeSale());
    // Simulate the flush having already cleared it:
    await db.delete(communityPushQueue).where(eq(communityPushQueue.saleId, "sale-1"));
    expect(await queuedSaleIds()).toEqual([]);

    await saveSale("community-user", makeSale({ meta: makeMeta({ finalAmount: 950 }) }));
    expect(await queuedSaleIds()).toEqual(["sale-1"]);
  });

  it("keeps a queued sale queued after the user switches to premium", async () => {
    await saveSale("community-user", makeSale());
    expect(await queuedSaleIds()).toEqual(["sale-1"]);

    await db.update(users).set({ subscriptionPlan: "premium" }).where(eq(users.id, "community-user"));

    // The row is still there — nothing removes an already-queued sale on
    // a plan switch, matching spec §5's "no retroactive removal" rule.
    expect(await queuedSaleIds()).toEqual(["sale-1"]);
  });

  it("queues a finished sale for a community-plan user even when it belongs to a batch", async () => {
    await db.insert(batches).values({
      id: "batch-1",
      userId: "community-user",
      name: "Shed 1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await saveSale("community-user", makeSale({ batchId: "batch-1" }));
    expect(await queuedSaleIds()).toEqual(["sale-1"]);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx jest __tests__/communityPush.test.ts`
Expected: FAIL — the queue stays empty for every case, since no trigger
exists yet.

- [ ] **Step 6: Write the trigger migration**

Run: `npx drizzle-kit generate --custom --name=community_push_enqueue_triggers`

This creates an empty custom migration file (Drizzle Kit's `--custom`
flag skips schema-diffing and just gives you a blank numbered file to
hand-write, since triggers aren't part of the Drizzle schema DSL). Note
the filename, then write into it:

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

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx jest __tests__/communityPush.test.ts`
Expected: PASS, all 6 tests

- [ ] **Step 8: Run the full test suite**

Run: `npx jest`
Expected: all suites pass

- [ ] **Step 9: Commit**

```bash
git add db/schema.ts db/migrations/ __tests__/communityPush.test.ts
git commit -m "feat(db): add community_push_queue table and enqueue triggers"
```

---

## Task 6: Payload assembly and push function

**Files:**
- Create: `lib/communityPush/push.ts`
- Test: `__tests__/communityPushPush.test.ts`

**Interfaces:**
- Consumes: `communityPushQueue` table (Task 5); the `push-community-sale`
  Edge Function's request shape (Task 4, `PushPayload` interface — mirror
  its field names and types exactly, this is the client-side counterpart)
- Produces: `assembleCommunityPushPayload(saleId: string): Promise<CommunityPushPayload | null>`,
  `flushCommunityPushQueue(invokeFn: (payload: CommunityPushPayload) => Promise<boolean>): Promise<void>`
  (consumed by Task 7)

- [ ] **Step 1: Write the failing test**

Create `__tests__/communityPushPush.test.ts`:

```ts
import { db } from "../db/client";
import { users, batches, communityPushQueue } from "../db/schema";
import { saveSale } from "../lib/storage";
import { assembleCommunityPushPayload, flushCommunityPushQueue } from "../lib/communityPush/push";
import type { MeasurementRow, SaleMetaData, SaleRecord } from "../lib/types";
import { applyMigrations, resetDb } from "./helpers/db";
import { eq } from "drizzle-orm";

beforeAll(() => applyMigrations());

beforeEach(async () => {
  resetDb();
  await db.insert(users).values({
    id: "community-user",
    subscriptionPlan: "community",
    districtId: "10",
    upazilaId: "100",
    farmCapacity: 1500,
  });
});

function makeRow(o: Partial<MeasurementRow> = {}): MeasurementRow {
  return { id: "r1", weightKg: 2, pcs: 4, timestamp: 1_000, ...o };
}

function makeMeta(o: Partial<SaleMetaData> = {}): SaleMetaData {
  return {
    mainWeightKg: 10,
    mainPcs: 5,
    avgWtGrams: 2000,
    kgPerCrate: 2,
    deductionPerCrateG: 200,
    isFullCratesOnly: false,
    mainPrice: 100,
    mainAmount: 900,
    cullWeightKg: 0,
    finalAmount: 900,
    receivedAmount: 900,
    totalDeductionWtKg: 1,
    netWeightKg: 9,
    totalCrates: 5,
    totalPcs: 5,
    buyerType: "wholesaler",
    createdAt: 1_000,
    ...o,
  };
}

function makeSale(o: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: "sale-1",
    userId: "community-user",
    phase: "main",
    isPcsTracked: true,
    hasCull: false,
    isFinished: true,
    rows: [makeRow()],
    createdAt: 1_000,
    updatedAt: 1_000,
    meta: makeMeta(),
    ...o,
  };
}

describe("assembleCommunityPushPayload", () => {
  it("assembles a standalone sale's payload with batch fields null", async () => {
    await saveSale("community-user", makeSale());

    const payload = await assembleCommunityPushPayload("sale-1");
    expect(payload).toMatchObject({
      saleId: "sale-1",
      batchId: null,
      phase: "main",
      buyerType: "wholesaler",
      districtId: "10",
      upazilaId: "100",
      farmCapacity: 1500,
      breed: null,
      placementDate: null,
      initialBirdCount: null,
      isPcsTracked: true,
      isFullCratesOnly: false,
      totalWeightKg: 9,
      pricePerKg: 100,
      totalAmount: 900,
    });
  });

  it("assembles a batched sale's payload with the batch's breed/placementDate/initialBirdCount", async () => {
    await db.insert(batches).values({
      id: "batch-1",
      userId: "community-user",
      name: "Shed 1",
      breed: "sonali",
      placementDate: new Date("2026-01-01T00:00:00Z"),
      initialBirdCount: 500,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await saveSale("community-user", makeSale({ batchId: "batch-1" }));

    const payload = await assembleCommunityPushPayload("sale-1");
    expect(payload).toMatchObject({
      batchId: "batch-1",
      breed: "sonali",
      placementDate: "2026-01-01",
      initialBirdCount: 500,
    });
  });

  it("nulls birdsSold and avgWeightKg for a weight-only (non-pcs-tracked) sale", async () => {
    await saveSale(
      "community-user",
      makeSale({
        isPcsTracked: false,
        meta: makeMeta({ mainPcs: undefined, avgWtGrams: undefined, totalPcs: undefined }),
      }),
    );

    const payload = await assembleCommunityPushPayload("sale-1");
    expect(payload?.birdsSold).toBeNull();
    expect(payload?.avgWeightKg).toBeNull();
  });

  it("returns null for a sale that no longer exists", async () => {
    expect(await assembleCommunityPushPayload("nope")).toBeNull();
  });
});

describe("flushCommunityPushQueue", () => {
  it("clears the queue row on a successful push", async () => {
    await saveSale("community-user", makeSale());
    expect(await db.select().from(communityPushQueue)).toHaveLength(1);

    await flushCommunityPushQueue(async () => true);

    expect(await db.select().from(communityPushQueue)).toHaveLength(0);
  });

  it("leaves the queue row in place on a failed push", async () => {
    await saveSale("community-user", makeSale());

    await flushCommunityPushQueue(async () => false);

    expect(await db.select().from(communityPushQueue)).toHaveLength(1);
  });

  it("processes every queued sale independently — one failure does not block another", async () => {
    await saveSale("community-user", makeSale({ id: "sale-1" }));
    await saveSale("community-user", makeSale({ id: "sale-2" }));

    const results: Record<string, boolean> = { "sale-1": false, "sale-2": true };
    await flushCommunityPushQueue(async (payload) => results[payload.saleId]);

    const remaining = (await db.select().from(communityPushQueue)).map((r) => r.saleId);
    expect(remaining).toEqual(["sale-1"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/communityPushPush.test.ts`
Expected: FAIL — `Cannot find module '../lib/communityPush/push'`

- [ ] **Step 3: Write `lib/communityPush/push.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sales, saleMetaData, batches, users, communityPushQueue } from "@/db/schema";

export interface CommunityPushPayload {
  saleId: string;
  batchId: string | null;
  saleDate: string; // "YYYY-MM-DD"
  phase: "main" | "cull";
  buyerType: "wholesaler" | "retail" | "direct" | null;
  birdsSold: number | null;
  avgWeightKg: number | null;
  totalWeightKg: number;
  pricePerKg: number;
  totalAmount: number;
  kgPerCrate: number;
  deductionPerCrateG: number;
  totalCrates: number;
  totalDeductionWtKg: number;
  hasCullPortion: boolean;
  cullWeightKg: number | null;
  cullPricePerKg: number | null;
  cullPcs: number | null;
  isPcsTracked: boolean;
  isFullCratesOnly: boolean;
  breed: "cobb_500" | "ross_308" | "hubbard" | "sonali" | "deshi" | "other" | null;
  placementDate: string | null;
  initialBirdCount: number | null;
  districtId: string;
  upazilaId: string;
  farmCapacity: number | null;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Reads everything a single queued sale needs, joined from the sale, its
// meta, its batch (if any), and the owning user's location/capacity.
// Returns null if the sale (or its meta) no longer exists — a queue row
// referencing a deleted sale is caught by the FK's ON DELETE CASCADE
// before this ever runs, but a defensive null keeps this function total.
export async function assembleCommunityPushPayload(
  saleId: string,
): Promise<CommunityPushPayload | null> {
  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  if (!sale) return null;
  const meta = await db.select().from(saleMetaData).where(eq(saleMetaData.saleId, saleId)).get();
  if (!meta) return null;
  const user = await db.select().from(users).where(eq(users.id, sale.userId)).get();
  if (!user || !user.districtId || !user.upazilaId) return null;
  const batch = sale.batchId
    ? await db.select().from(batches).where(eq(batches.id, sale.batchId)).get()
    : null;

  return {
    saleId: sale.id,
    batchId: sale.batchId ?? null,
    saleDate: toDateOnly(sale.createdAt),
    phase: sale.phase,
    buyerType: meta.buyerType ?? null,
    birdsSold: meta.totalPcs ?? null,
    avgWeightKg: meta.avgWtGrams != null ? meta.avgWtGrams / 1000 : null,
    totalWeightKg: meta.netWeightKg,
    pricePerKg: meta.mainPrice,
    totalAmount: meta.finalAmount,
    kgPerCrate: meta.kgPerCrate,
    deductionPerCrateG: meta.deductionPerCrateG,
    totalCrates: meta.totalCrates,
    totalDeductionWtKg: meta.totalDeductionWtKg,
    hasCullPortion: sale.hasCull,
    cullWeightKg: meta.cullWeightKg ?? null,
    cullPricePerKg: meta.cullPrice ?? null,
    cullPcs: meta.cullPcs ?? null,
    isPcsTracked: sale.isPcsTracked,
    isFullCratesOnly: meta.isFullCratesOnly,
    breed: batch?.breed ?? null,
    placementDate: batch?.placementDate ? toDateOnly(batch.placementDate) : null,
    initialBirdCount: batch?.initialBirdCount ?? null,
    districtId: user.districtId,
    upazilaId: user.upazilaId,
    farmCapacity: user.farmCapacity ?? null,
  };
}

// Drains the whole queue. `invoke` does the actual network call (injected
// so this stays testable without mocking fetch/supabase here — the real
// invoke lives in schedule.ts) and returns whether the push succeeded.
// Each queued sale is processed independently: one failure leaves that
// row for the next flush without blocking the rest of the queue.
export async function flushCommunityPushQueue(
  invoke: (payload: CommunityPushPayload) => Promise<boolean>,
): Promise<void> {
  const queued = await db.select().from(communityPushQueue);
  for (const row of queued) {
    const payload = await assembleCommunityPushPayload(row.saleId);
    if (!payload) {
      // Nothing sensible to push (e.g. the sale's user lost its location
      // somehow) — drop the row rather than retry forever.
      await db.delete(communityPushQueue).where(eq(communityPushQueue.saleId, row.saleId));
      continue;
    }
    const succeeded = await invoke(payload);
    if (succeeded) {
      await db.delete(communityPushQueue).where(eq(communityPushQueue.saleId, row.saleId));
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/communityPushPush.test.ts`
Expected: PASS, all 8 tests

- [ ] **Step 5: Run the full test suite**

Run: `npx jest`
Expected: all suites pass

- [ ] **Step 6: Commit**

```bash
git add lib/communityPush/push.ts __tests__/communityPushPush.test.ts
git commit -m "feat(communityPush): add payload assembly and queue flush"
```

---

## Task 7: Schedule hook and mounting

**Files:**
- Create: `lib/communityPush/schedule.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `flushCommunityPushQueue` (Task 6); `useSupabase()` (existing,
  `hooks/useSupabase.ts`)
- Produces: `useCommunityPush(userId: string | null | undefined): void`
  (mounted in `app/_layout.tsx`, nothing else consumes it — this hook has
  no return value used elsewhere, unlike `useDriveSync`, since there is no
  UI for community-push status per spec §7)

- [ ] **Step 1: Write `lib/communityPush/schedule.ts`**

```ts
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSupabase } from "@/hooks/useSupabase";
import { flushCommunityPushQueue, type CommunityPushPayload } from "./push";

// Same cadence as lib/driveSync/schedule.ts's own interval — no reason
// for these two background flush loops to run on different clocks.
const FLUSH_INTERVAL_MS = 60_000;

// No UI reads this hook's output — unlike useDriveSync, there is no
// "push status" surface anywhere in the app (spec §7). It exists purely
// to be mounted for its side effects.
export function useCommunityPush(userId: string | null | undefined): void {
  const supabase = useSupabase();
  const supabaseRef = useRef(supabase);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    supabaseRef.current = supabase;
  }, [supabase]);

  const invoke = useCallback(async (payload: CommunityPushPayload): Promise<boolean> => {
    try {
      const { error } = await supabaseRef.current.functions.invoke("push-community-sale", {
        body: payload,
      });
      if (error) {
        console.warn(`[communityPush] push failed for sale ${payload.saleId}`, error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`[communityPush] push threw for sale ${payload.saleId}`, err);
      return false;
    }
  }, []);

  const flush = useCallback(async () => {
    try {
      await flushCommunityPushQueue(invoke);
    } catch (err) {
      console.warn("[communityPush] flush failed", err);
    }
  }, [invoke]);

  useEffect(() => {
    if (!userId) return;

    console.log(`[communityPush] mounted for user ${userId}`);
    flush();

    const interval = setInterval(() => {
      console.log("[communityPush] trigger: interval");
      flush();
    }, FLUSH_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current === "active" && /inactive|background/.test(next)) {
        console.log("[communityPush] trigger: app backgrounded");
        flush();
      }
      appState.current = next;
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId, flush]);
}
```

- [ ] **Step 2: Mount it in `app/_layout.tsx`**

Add the import, alongside the existing `useDriveSync` import:

```ts
import { useCommunityPush } from "@/lib/communityPush/schedule";
```

In `AuthGuard`, right after the existing
`const driveSync = useDriveSync(isSignedIn ? user?.id : null);` line, add:

```ts
  useCommunityPush(isSignedIn ? user?.id : null);
```

(No variable assignment needed — this hook's return value is `void`,
unlike `useDriveSync`'s object. It's mounted purely for its background
effect.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `lib/communityPush/schedule.ts` or
`app/_layout.tsx` (pre-existing unrelated errors in
`supabase/functions/drive-token/index.ts` are expected and not part of
this change).

- [ ] **Step 4: Run the full test suite**

Run: `npx jest`
Expected: all suites pass

- [ ] **Step 5: Bundle-check proxy (no live device in this environment)**

Run: `npx expo export --platform ios --output-dir <a scratch dir under /tmp>`
Expected: completes with `iOS Bundled` and no errors — confirms
`app/_layout.tsx`'s new import and hook call resolve correctly through
Metro. Delete the scratch output dir afterward.

- [ ] **Step 6: Commit**

```bash
git add lib/communityPush/schedule.ts app/_layout.tsx
git commit -m "feat(communityPush): add schedule hook, mount alongside Drive sync"
```

- [ ] **Step 7: Document the manual deploy steps (not run as part of this task)**

This step produces no code change — it's a checklist for the user, since
this plan's Global Constraints forbid any task from applying migrations
or deploying the function automatically. When ready to actually turn this
on:

1. `supabase secrets set PUSH_SECRET=$(openssl rand -hex 32)` — generates
   and sets the HMAC secret Task 4's function needs. Run once; note it
   nowhere else, it never needs to be read back (the HMAC is one-way).
2. `supabase db push` (without `--dry-run`) — applies all migrations from
   Tasks 1-3, in order: drops the legacy tables, creates the new schema,
   seeds the reference tables.
3. `supabase functions deploy push-community-sale` — deploys Task 4's
   function.
4. Verify with a real finished sale on a community-plan test account: the
   sale should appear in `community_push_queue` immediately (checkable
   via a local DB inspector), then disappear within `FLUSH_INTERVAL_MS`
   (60s) or on backgrounding the app, and `sale_event` in the Supabase
   dashboard should show the matching row.
