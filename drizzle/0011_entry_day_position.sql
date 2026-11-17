ALTER TABLE `entries` ADD `day_position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing entries keep their order: within a day, the one created last comes first.
UPDATE `entries` SET `day_position` = `id`;
