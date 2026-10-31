CREATE TYPE "public"."candidate_status" AS ENUM('queued', 'reading', 'scored', 'failed', 'duplicate');--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_key" text NOT NULL,
	"file_sha256" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_type" text NOT NULL,
	"status" "candidate_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"name" text,
	"email" text,
	"phone" text,
	"years" real,
	"current_title" text,
	"match" jsonb,
	"score" integer,
	"shortlisted" boolean DEFAULT false NOT NULL,
	"duplicate_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_role_file_idx" ON "candidates" USING btree ("role_id","file_sha256");--> statement-breakpoint
CREATE INDEX "candidates_role_score_idx" ON "candidates" USING btree ("role_id","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "candidates_role_status_idx" ON "candidates" USING btree ("role_id","status");--> statement-breakpoint
CREATE INDEX "candidates_role_email_idx" ON "candidates" USING btree ("role_id","email");