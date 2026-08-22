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
