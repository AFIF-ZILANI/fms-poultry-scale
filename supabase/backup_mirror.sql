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
