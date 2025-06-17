PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`display_name` text,
	`oAuthID` text,
	`oauth_provider` text,
	`key_login` text NOT NULL,
	`api_keys` text,
	`instance_ip` text NOT NULL,
	`preferences` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_sync_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "display_name", "oAuthID", "oauth_provider", "key_login", "api_keys", "instance_ip", "preferences", "created_at", "updated_at", "last_sync_at") SELECT "id", "email", "display_name", "oAuthID", "oauth_provider", "key_login", "api_keys", "instance_ip", "preferences", "created_at", "updated_at", "last_sync_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_key_login_idx` ON `users` (`key_login`);--> statement-breakpoint
CREATE INDEX `users_instance_ip_idx` ON `users` (`instance_ip`);