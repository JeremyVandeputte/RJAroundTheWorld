ALTER TABLE `trips` ADD `author_id` integer REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
-- Trips created before authors were recorded belong to the superuser.
UPDATE `trips` SET `author_id` = (SELECT `id` FROM `users` WHERE `role` = 'superuser' ORDER BY `id` LIMIT 1) WHERE `author_id` IS NULL;
