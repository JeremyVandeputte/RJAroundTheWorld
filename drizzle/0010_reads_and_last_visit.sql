CREATE TABLE `entry_reads` (
	`entry_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `user_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_reads_user_idx` ON `entry_reads` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` integer;