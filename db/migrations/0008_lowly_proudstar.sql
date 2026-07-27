PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sale_meta_data` (
	`sale_id` text PRIMARY KEY NOT NULL,
	`main_weight_kg` real NOT NULL,
	`main_pcs` integer,
	`buyer_name` text,
	`kg_per_crate` real NOT NULL,
	`deduction_per_crate_g` real NOT NULL,
	`is_full_crates_only` integer NOT NULL,
	`main_price` real NOT NULL,
	`main_amount` real NOT NULL,
	`cull_weight_kg` real DEFAULT 0 NOT NULL,
	`is_cull_sold` integer,
	`cull_sale_type` text,
	`cull_price` real,
	`cull_pcs` integer,
	`cull_amount` real,
	`final_amount` real NOT NULL,
	`received_amount` real NOT NULL,
	`total_deduction_wt_kg` real NOT NULL,
	`avg_wt_grams` real,
	`net_weight_kg` real NOT NULL,
	`total_crates` real NOT NULL,
	`total_pcs` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sale_meta_data`("sale_id", "main_weight_kg", "main_pcs", "buyer_name", "kg_per_crate", "deduction_per_crate_g", "is_full_crates_only", "main_price", "main_amount", "cull_weight_kg", "is_cull_sold", "cull_sale_type", "cull_price", "cull_pcs", "cull_amount", "final_amount", "received_amount", "total_deduction_wt_kg", "avg_wt_grams", "net_weight_kg", "total_crates", "total_pcs", "created_at") SELECT "sale_id", "main_weight_kg", "main_pcs", "buyer_name", "kg_per_crate", "deduction_per_crate_g", "is_full_crates_only", "main_price", "main_amount", "cull_weight_kg", "is_cull_sold", "cull_sale_type", "cull_price", "cull_pcs", "cull_amount", "final_amount", "received_amount", "total_deduction_wt_kg", "avg_wt_grams", "net_weight_kg", "total_crates", "total_pcs", "created_at" FROM `sale_meta_data`;--> statement-breakpoint
DROP TABLE `sale_meta_data`;--> statement-breakpoint
ALTER TABLE `__new_sale_meta_data` RENAME TO `sale_meta_data`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_user_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`log_group_size` integer DEFAULT 10 NOT NULL,
	`kg_per_crate` real DEFAULT 0 NOT NULL,
	`deduction_wt_g` real DEFAULT 0 NOT NULL,
	`price_kg` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_prefs`("user_id", "language", "theme", "log_group_size", "kg_per_crate", "deduction_wt_g", "price_kg") SELECT "user_id", "language", "theme", "log_group_size", "kg_per_crate", "deduction_wt_g", "price_kg" FROM `user_prefs`;--> statement-breakpoint
DROP TABLE `user_prefs`;--> statement-breakpoint
ALTER TABLE `__new_user_prefs` RENAME TO `user_prefs`;--> statement-breakpoint
CREATE INDEX `sales_user_created_idx` ON `sales` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `sales` DROP COLUMN `synced`;--> statement-breakpoint
ALTER TABLE `sales` DROP COLUMN `synced_at`;