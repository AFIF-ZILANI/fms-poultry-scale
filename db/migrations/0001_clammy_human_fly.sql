ALTER TABLE `prefs` RENAME TO `user_prefs`;--> statement-breakpoint
ALTER TABLE `user_prefs` RENAME COLUMN "key" TO "user_id";--> statement-breakpoint
ALTER TABLE `user_prefs` RENAME COLUMN "value" TO "language";--> statement-breakpoint
ALTER TABLE `row_edit_history` RENAME COLUMN "previous_weight_kg" TO "previous_weight";--> statement-breakpoint
ALTER TABLE `row_edit_history` RENAME COLUMN "new_weight_kg" TO "new_weight";--> statement-breakpoint
ALTER TABLE `row_edit_history` RENAME COLUMN "timestamp" TO "created_at";--> statement-breakpoint
CREATE TABLE `sale_meta_data` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
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
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`phone` text,
	`location` text NOT NULL,
	`farm_name` text,
	`business_name` text,
	`role` text NOT NULL,
	`subscription_plan` text DEFAULT 'community' NOT NULL,
	`farm_capacity` integer,
	`buying_capacity` integer,
	`supply_regions` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `drafts`;--> statement-breakpoint
DROP TABLE `trade_deductions`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`log_group_size` integer DEFAULT 10 NOT NULL,
	`kg_per_crate` real NOT NULL,
	`deduction_wt_g` real NOT NULL,
	`price_kg` real NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_prefs`("user_id", "language", "theme", "log_group_size", "kg_per_crate", "deduction_wt_g", "price_kg") SELECT "user_id", "language", "theme", "log_group_size", "kg_per_crate", "deduction_wt_g", "price_kg" FROM `user_prefs`;--> statement-breakpoint
DROP TABLE `user_prefs`;--> statement-breakpoint
ALTER TABLE `__new_user_prefs` RENAME TO `user_prefs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_measurement_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`type` text NOT NULL,
	`weight` real NOT NULL,
	`pcs` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_measurement_rows`("id", "sale_id", "type", "weight", "pcs", "created_at") SELECT "id", "sale_id", "type", "weight", "pcs", "created_at" FROM `measurement_rows`;--> statement-breakpoint
DROP TABLE `measurement_rows`;--> statement-breakpoint
ALTER TABLE `__new_measurement_rows` RENAME TO `measurement_rows`;--> statement-breakpoint
ALTER TABLE `row_edit_history` ADD `reason` text;--> statement-breakpoint
CREATE TABLE `__new_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`phase` text NOT NULL,
	`is_pcs_tracked` integer NOT NULL,
	`has_cull` integer DEFAULT false NOT NULL,
	`is_finished` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced` integer DEFAULT false NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sales`("id", "user_id", "phase", "is_pcs_tracked", "has_cull", "is_finished", "created_at", "updated_at", "synced", "synced_at") SELECT "id", "user_id", "phase", "is_pcs_tracked", "has_cull", "is_finished", "created_at", "updated_at", "synced", "synced_at" FROM `sales`;--> statement-breakpoint
DROP TABLE `sales`;--> statement-breakpoint
ALTER TABLE `__new_sales` RENAME TO `sales`;