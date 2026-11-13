CREATE TABLE `entry_tags` (
	`entry_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `tag_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_tags_tag_idx` ON `entry_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);--> statement-breakpoint
-- Starting list of tags, editable afterwards.
INSERT INTO `tags` (`name`, `slug`, `created_at`) VALUES
	('plage', 'plage', 1794873600000),
	('randonnée', 'randonnee', 1794873600000),
	('nourriture', 'nourriture', 1794873600000),
	('paysage', 'paysage', 1794873600000),
	('ville', 'ville', 1794873600000),
	('culture', 'culture', 1794873600000),
	('faune et flore', 'faune-et-flore', 1794873600000),
	('baignade', 'baignade', 1794873600000),
	('sortie en mer', 'sortie-en-mer', 1794873600000),
	('détente', 'detente', 1794873600000);
