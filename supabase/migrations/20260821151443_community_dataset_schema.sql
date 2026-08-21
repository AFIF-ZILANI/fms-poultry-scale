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
