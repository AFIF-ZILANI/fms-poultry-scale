CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `batches_user_id_idx` ON `batches` (`user_id`,`closed_at`);--> statement-breakpoint
-- drizzle-kit omits the ON DELETE clause when generating ADD COLUMN, which
-- would leave this FK at NO ACTION and make deleting a non-empty batch fail.
-- SQLite accepts the clause here because the added column defaults to NULL.
ALTER TABLE `sales` ADD `batch_id` text REFERENCES batches(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `sales_batch_id_idx` ON `sales` (`batch_id`);