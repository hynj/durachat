PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_token` text NOT NULL,
	`refresh_token` text,
	`secret_hash` blob NOT NULL,
	`metadata` text NOT NULL,
	`is_active` integer DEFAULT false,
	`requires_2fa` integer DEFAULT false,
	`is_2fa_verified` integer DEFAULT false,
	`expires_at` integer NOT NULL,
	`last_accessed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "user_id", "session_token", "refresh_token", "secret_hash", "metadata", "is_active", "requires_2fa", "is_2fa_verified", "expires_at", "last_accessed_at", "created_at", "updated_at") SELECT "id", "user_id", "session_token", "refresh_token", "secret_hash", "metadata", "is_active", "requires_2fa", "is_2fa_verified", "expires_at", "last_accessed_at", "created_at", "updated_at" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_token_unique` ON `sessions` (`session_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_refresh_token_unique` ON `sessions` (`refresh_token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_token_idx` ON `sessions` (`session_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_refresh_token_idx` ON `sessions` (`refresh_token`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);