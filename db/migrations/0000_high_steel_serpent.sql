CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`phase` text,
	`pcs_optional` integer,
	`total_weight_kg` real NOT NULL,
	`total_pcs` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `measurement_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text,
	`draft_id` text,
	`kind` text NOT NULL,
	`weight_kg` real NOT NULL,
	`pcs` integer,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prefs` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `row_edit_history` (
	`id` text PRIMARY KEY NOT NULL,
	`row_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`previous_weight_kg` real NOT NULL,
	`previous_pcs` integer,
	`new_weight_kg` real NOT NULL,
	`new_pcs` integer,
	FOREIGN KEY (`row_id`) REFERENCES `measurement_rows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`total_weight_kg` real NOT NULL,
	`total_weight_grams` integer NOT NULL,
	`total_pcs` integer NOT NULL,
	`pcs_tracked` integer,
	`average_weight_kg` real NOT NULL,
	`average_weight_grams` integer NOT NULL,
	`buyer_name` text,
	`received_amount` real,
	`created_at` integer NOT NULL,
	`synced` integer DEFAULT false NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `trade_deductions` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`gross_weight` real NOT NULL,
	`kg_per_crate` real NOT NULL,
	`deduction_per_crate_g` real NOT NULL,
	`full_crates_only` integer NOT NULL,
	`total_crates` real NOT NULL,
	`total_deduction_kg` real NOT NULL,
	`cull_weight_kg` real NOT NULL,
	`net_weight` real NOT NULL,
	`price_per_kg` real NOT NULL,
	`main_amount` real,
	`cull_session_mode` text,
	`cull_sold` integer,
	`cull_pricing_mode` text,
	`cull_price` real,
	`cull_pcs` integer,
	`cull_amount` real,
	`final_amount` real NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade
);
