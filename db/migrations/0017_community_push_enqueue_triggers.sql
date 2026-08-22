CREATE TRIGGER community_push_enqueue_insert
AFTER INSERT ON sale_meta_data
WHEN (
  SELECT is_finished FROM sales WHERE id = NEW.sale_id
) = 1
AND (
  SELECT subscription_plan FROM users
  WHERE id = (SELECT user_id FROM sales WHERE id = NEW.sale_id)
) = 'community'
-- INSERT OR IGNORE does not suppress the conflict when this trigger fires
-- from inside saveSale's own sale_meta_data upsert (its ON CONFLICT DO
-- UPDATE branch) — throws UNIQUE constraint failed instead. WHERE NOT
-- EXISTS sidesteps SQLite's conflict-resolution machinery entirely and
-- is idempotent the same way OR IGNORE would have been.
BEGIN
  INSERT INTO community_push_queue (sale_id, queued_at)
  SELECT NEW.sale_id, CAST(strftime('%s','now') AS INTEGER)
  WHERE NOT EXISTS (
    SELECT 1 FROM community_push_queue WHERE sale_id = NEW.sale_id
  );
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
-- INSERT OR IGNORE does not suppress the conflict when this trigger fires
-- from inside saveSale's own sale_meta_data upsert (its ON CONFLICT DO
-- UPDATE branch) — throws UNIQUE constraint failed instead. WHERE NOT
-- EXISTS sidesteps SQLite's conflict-resolution machinery entirely and
-- is idempotent the same way OR IGNORE would have been.
BEGIN
  INSERT INTO community_push_queue (sale_id, queued_at)
  SELECT NEW.sale_id, CAST(strftime('%s','now') AS INTEGER)
  WHERE NOT EXISTS (
    SELECT 1 FROM community_push_queue WHERE sale_id = NEW.sale_id
  );
END;
