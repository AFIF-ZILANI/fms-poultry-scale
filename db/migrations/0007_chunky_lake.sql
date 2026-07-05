CREATE INDEX `measurement_rows_sale_id_type_idx` ON `measurement_rows` (`sale_id`,`type`);--> statement-breakpoint
CREATE INDEX `row_edit_history_row_id_idx` ON `row_edit_history` (`row_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sale_meta_data_sale_id_idx` ON `sale_meta_data` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sales_user_id_idx` ON `sales` (`user_id`,`is_finished`,`updated_at`);