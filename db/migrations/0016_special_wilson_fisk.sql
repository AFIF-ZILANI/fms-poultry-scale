CREATE TABLE `community_push_queue` (
	`sale_id` text PRIMARY KEY NOT NULL,
	`queued_at` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade
);
