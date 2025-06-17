CREATE TABLE `billing_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`payment_method` text,
	`payment_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_user_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `billing_history_user_id_idx` ON `billing_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `billing_history_type_idx` ON `billing_history` (`type`);--> statement-breakpoint
CREATE INDEX `billing_history_status_idx` ON `billing_history` (`status`);--> statement-breakpoint
CREATE INDEX `billing_history_created_at_idx` ON `billing_history` (`created_at`);--> statement-breakpoint
CREATE TABLE `user_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`description` text,
	`provider` text,
	`model` text,
	`tokens_used` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_credits_user_id_idx` ON `user_credits` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_credits_type_idx` ON `user_credits` (`type`);--> statement-breakpoint
CREATE INDEX `user_credits_created_at_idx` ON `user_credits` (`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `credits` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `api_keys`;