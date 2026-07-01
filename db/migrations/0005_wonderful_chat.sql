PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`phone` text,
	`email` text,
	`location` text NOT NULL,
	`farm_name` text,
	`is_onboarded` integer DEFAULT false NOT NULL,
	`business_name` text,
	`role` text NOT NULL,
	`subscription_plan` text DEFAULT 'community' NOT NULL,
	`farm_capacity` integer,
	`buying_capacity` integer,
	`breed` text,
	`supply_regions` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "name", "phone", "email", "location", "farm_name", "is_onboarded", "business_name", "role", "subscription_plan", "farm_capacity", "buying_capacity", "breed", "supply_regions", "created_at") SELECT "id", "name", "phone", "email", "location", "farm_name", "is_onboarded", "business_name", "role", "subscription_plan", "farm_capacity", "buying_capacity", "breed", "supply_regions", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;