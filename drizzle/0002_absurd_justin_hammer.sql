CREATE TYPE "public"."role_status" AS ENUM('draft', 'kit_ready', 'collecting', 'interviewing', 'results_ready', 'closed');--> statement-breakpoint
CREATE TABLE "action_rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"job_description" text NOT NULL,
	"status" "role_status" DEFAULT 'draft' NOT NULL,
	"applied_count" integer DEFAULT 0 NOT NULL,
	"invited_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"to_review_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roles_owner_activity_idx" ON "roles" USING btree ("owner_id","last_activity_at" DESC NULLS LAST,"id" DESC NULLS LAST);