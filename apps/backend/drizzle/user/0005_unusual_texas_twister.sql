CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_api_keys` text,
	`legacy_api_keys` text,
	`preferences` text,
	`balance` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
