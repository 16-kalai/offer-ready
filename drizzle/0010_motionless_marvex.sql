ALTER TABLE "invitations" ADD COLUMN "nudge_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "last_nudged_at" timestamp with time zone;