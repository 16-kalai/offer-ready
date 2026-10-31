ALTER TABLE "roles" ADD COLUMN "brief" jsonb;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "jd" jsonb;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "jd_model" text;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "jd_approved_at" timestamp with time zone;