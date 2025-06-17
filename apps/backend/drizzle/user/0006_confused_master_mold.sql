PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`usage_model` text DEFAULT 'byok' NOT NULL,
	`encrypted_api_keys` text,
	`legacy_api_keys` text,
	`preferences` text,
	`balance` integer DEFAULT 5000 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user_settings`("id", "usage_model", "encrypted_api_keys", "legacy_api_keys", "preferences", "balance", "created_at", "updated_at") SELECT "id", "usage_model", "encrypted_api_keys", "legacy_api_keys", "preferences", "balance", "created_at", "updated_at" FROM `user_settings`;--> statement-breakpoint
DROP TABLE `user_settings`;--> statement-breakpoint
ALTER TABLE `__new_user_settings` RENAME TO `user_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;