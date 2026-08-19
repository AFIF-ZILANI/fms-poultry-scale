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
