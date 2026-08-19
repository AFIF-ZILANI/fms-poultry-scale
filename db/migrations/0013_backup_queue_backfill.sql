-- Backfill data_backup_queue for rows that already existed before the
-- triggers in 0012 were installed. Triggers only fire on future writes, so
-- without this every row on an already-installed device is invisible to the
-- sync engine until it happens to be edited again — which for a finished
-- sale is never.
--
-- ON CONFLICT DO NOTHING so a row already queued by a trigger (its pending
-- op, possibly a delete) is never overwritten by a stale 'upsert'.
--
-- The `WHERE true` is not a filter: SQLite cannot parse ON CONFLICT after an
-- INSERT ... SELECT without a WHERE clause to end the SELECT unambiguously.
INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
SELECT 'users', id, 'upsert', CAST(strftime('%s','now') AS INTEGER) FROM users WHERE true
ON CONFLICT (table_name, row_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
SELECT 'user_prefs', user_id, 'upsert', CAST(strftime('%s','now') AS INTEGER) FROM user_prefs WHERE true
ON CONFLICT (table_name, row_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
SELECT 'batches', id, 'upsert', CAST(strftime('%s','now') AS INTEGER) FROM batches WHERE true
ON CONFLICT (table_name, row_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
SELECT 'sales', id, 'upsert', CAST(strftime('%s','now') AS INTEGER) FROM sales WHERE true
ON CONFLICT (table_name, row_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
SELECT 'sale_meta_data', sale_id, 'upsert', CAST(strftime('%s','now') AS INTEGER) FROM sale_meta_data WHERE true
ON CONFLICT (table_name, row_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
SELECT 'measurement_rows', id, 'upsert', CAST(strftime('%s','now') AS INTEGER) FROM measurement_rows WHERE true
ON CONFLICT (table_name, row_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO data_backup_queue (table_name, row_id, op, queued_at)
SELECT 'row_edit_history', id, 'upsert', CAST(strftime('%s','now') AS INTEGER) FROM row_edit_history WHERE true
ON CONFLICT (table_name, row_id) DO NOTHING;
