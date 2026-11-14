-- Comments and reactions are removed from the site, with their notifications
-- and the Commenter / Réagir permissions.
DELETE FROM `notifications` WHERE `type` NOT IN ('entry_published', 'entry_tagged', 'trip_revealed');--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` integer NOT NULL,
	`actor_id` integer NOT NULL,
	`type` text NOT NULL,
	`trip_id` integer NOT NULL,
	`entry_id` integer,
	`is_tagged` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "recipient_id", "actor_id", "type", "trip_id", "entry_id", "is_tagged", "read_at", "created_at") SELECT "id", "recipient_id", "actor_id", "type", "trip_id", "entry_id", "is_tagged", "read_at", "created_at" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_id`,`read_at`,`created_at`);--> statement-breakpoint
DROP TABLE `reactions`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `can_comment`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `can_react`;