CREATE TYPE "public"."report_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "interview_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"report" jsonb,
	"version" text,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_reports_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_reports_role_idx" ON "interview_reports" USING btree ("role_id","status");--> statement-breakpoint
CREATE INDEX "interview_reports_candidate_idx" ON "interview_reports" USING btree ("candidate_id");