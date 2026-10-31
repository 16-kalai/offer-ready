ALTER TABLE "roles" ADD COLUMN "kit" jsonb;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "kit_model" text;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "kit_approved_at" timestamp with time zone;