CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`data` blob,
	`storage_url` text,
	`created_at` integer NOT NULL,
	`last_sync_at` integer,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_message_id_idx` ON `attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`system_prompt` text,
	`is_shared` integer DEFAULT false,
	`share_id` text,
	`parent_id` text,
	`branch_point` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_sync_at` integer,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`parent_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_share_id_unique` ON `conversations` (`share_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_share_id_idx` ON `conversations` (`share_id`);--> statement-breakpoint
CREATE INDEX `conversations_parent_id_idx` ON `conversations` (`parent_id`);--> statement-breakpoint
CREATE INDEX `conversations_updated_at_idx` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `generated_images` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`prompt` text NOT NULL,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`image_url` text,
	`image_data` blob,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	`last_sync_at` integer,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generated_images_message_id_idx` ON `generated_images` (`message_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model` text,
	`provider` text,
	`token_count` integer,
	`order` integer NOT NULL,
	`parent_message_id` text,
	`is_streaming` integer DEFAULT false,
	`stream_completed` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_sync_at` integer,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `messages_order_idx` ON `messages` (`conversation_id`,`order`);--> statement-breakpoint
CREATE INDEX `messages_parent_message_id_idx` ON `messages` (`parent_message_id`);--> statement-breakpoint
CREATE TABLE `model_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_endpoint` text NOT NULL,
	`supported_models` text,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shared_access` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`share_id` text NOT NULL,
	`access_level` text DEFAULT 'read' NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`last_accessed_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_access_share_id_idx` ON `shared_access` (`share_id`);--> statement-breakpoint
CREATE INDEX `shared_access_conversation_id_idx` ON `shared_access` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `sync_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`last_modified` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`checksum` text,
	`conflict_resolved` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `usage` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`message_id` text,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_message_id_unique` ON `usage` (`message_id`);--> statement-breakpoint
CREATE INDEX `usage_conversation_id_idx` ON `usage` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `usage_model_idx` ON `usage` (`model`);--> statement-breakpoint
CREATE INDEX `usage_created_at_idx` ON `usage` (`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_token` text NOT NULL,
	`refresh_token` text,
	`metadata` text,
	`is_active` integer DEFAULT false,
	`requires_2fa` integer DEFAULT false,
	`is_2fa_verified` integer DEFAULT false,
	`expires_at` integer NOT NULL,
	`last_accessed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_token_unique` ON `sessions` (`session_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_refresh_token_unique` ON `sessions` (`refresh_token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_token_idx` ON `sessions` (`session_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_refresh_token_idx` ON `sessions` (`refresh_token`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);