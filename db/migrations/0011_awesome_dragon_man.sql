CREATE TABLE `data_backup_queue` (
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`queued_at` integer NOT NULL,
	PRIMARY KEY(`table_name`, `row_id`)
);
