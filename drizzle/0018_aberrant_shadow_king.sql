CREATE TYPE "public"."hiring_decision" AS ENUM('advance', 'hold', 'decline');--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'candidate_held' BEFORE 'role_closed';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'candidate_declined' BEFORE 'role_closed';--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "decision" "hiring_decision";--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "decision_note" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidates_role_decision_idx" ON "candidates" USING btree ("role_id","decision");