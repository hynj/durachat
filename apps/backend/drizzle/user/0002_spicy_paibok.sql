PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`data` blob,
	`storage_url` text,
	`created_at` integer NOT NULL,
	`last_sync_at` integer,
	`is_deleted` integer DEFAULT false
);
--> statement-breakpoint
INSERT INTO `__new_attachments`("id", "message_id", "file_name", "file_type", "file_size", "mime_type", "data", "storage_url", "created_at", "last_sync_at", "is_deleted") SELECT "id", "message_id", "file_name", "file_type", "file_size", "mime_type", "data", "storage_url", "created_at", "last_sync_at", "is_deleted" FROM `attachments`;--> statement-breakpoint
DROP TABLE `attachments`;--> statement-breakpoint
ALTER TABLE `__new_attachments` RENAME TO `attachments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `attachments_message_id_idx` ON `attachments` (`message_id`);