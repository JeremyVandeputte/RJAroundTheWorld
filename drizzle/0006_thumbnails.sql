-- Existing files all belong to an entry. Trip and entry thumbnails start empty.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`entry_id` integer,
	`trip_id` integer,
	`uploader_id` integer NOT NULL,
	`kind` text NOT NULL,
	`file_path` text NOT NULL,
	`thumb_path` text,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`exif_lat` real,
	`exif_lng` real,
	`exif_taken_at` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "media_single_owner" CHECK(("entry_id" is null) <> ("trip_id" is null))
);
--> statement-breakpoint
INSERT INTO `__new_media`("id", "public_id", "entry_id", "trip_id", "uploader_id", "kind", "file_path", "thumb_path", "mime_type", "size_bytes", "width", "height", "position", "exif_lat", "exif_lng", "exif_taken_at", "created_at") SELECT "id", "public_id", "entry_id", NULL, "uploader_id", "kind", "file_path", "thumb_path", "mime_type", "size_bytes", "width", "height", "position", "exif_lat", "exif_lng", "exif_taken_at", "created_at" FROM `media`;--> statement-breakpoint
DROP TABLE `media`;--> statement-breakpoint
ALTER TABLE `__new_media` RENAME TO `media`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `media_public_id_unique` ON `media` (`public_id`);--> statement-breakpoint
CREATE INDEX `media_entry_idx` ON `media` (`entry_id`,`position`);--> statement-breakpoint
CREATE INDEX `media_trip_idx` ON `media` (`trip_id`);--> statement-breakpoint
ALTER TABLE `entries` ADD `cover_media_id` integer REFERENCES media(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `trips` ADD `cover_media_id` integer REFERENCES media(id) ON DELETE set null;