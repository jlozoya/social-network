CREATE TABLE `realtime_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`channels` text NOT NULL,
	`created_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL
);
