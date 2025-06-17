CREATE TABLE `two_factor_auth` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text,
	`is_enabled` integer DEFAULT false,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `two_factor_auth_user_id_unique` ON `two_factor_auth` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `two_factor_auth_user_id_idx` ON `two_factor_auth` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text,
	`oAuthID` text,
	`oauth_provider` text,
	`key_login` text,
	`api_keys` text,
	`preferences` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_sync_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_idx` ON `users` (`username`);