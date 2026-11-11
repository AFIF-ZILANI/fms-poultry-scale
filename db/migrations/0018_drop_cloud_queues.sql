-- Triggers fed the Drive backup / community push queues; drop them first
-- or every write to the source tables fails once the queues are gone.
DROP TRIGGER IF EXISTS `community_push_enqueue_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `community_push_enqueue_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_batches_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_batches_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_batches_au`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_measurement_rows_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_measurement_rows_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_measurement_rows_au`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_row_edit_history_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_row_edit_history_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_row_edit_history_au`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_sale_meta_data_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_sale_meta_data_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_sale_meta_data_au`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_sales_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_sales_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_sales_au`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_user_prefs_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_user_prefs_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_user_prefs_au`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_users_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_users_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_backup_users_au`;--> statement-breakpoint
DROP TABLE `community_push_queue`;--> statement-breakpoint
DROP TABLE `data_backup_queue`;