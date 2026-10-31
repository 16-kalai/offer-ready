CREATE TYPE "public"."session_status" AS ENUM('consented', 'live', 'completed', 'incomplete');--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'accommodation_requested';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'new_link_requested';--> statement-breakpoint
ALTER TYPE "public"."invitation_status" ADD VALUE 'incomplete' BEFORE 'expired';--> statement-breakpoint
CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"status" "session_status" DEFAULT 'consented' NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"first_connect_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"end_reason" text,
	"part" text DEFAULT 'practice' NOT NULL,
	"revealed_cases" integer DEFAULT 0 NOT NULL,
	"twist_revealed" boolean DEFAULT false NOT NULL,
	"last_reveal_at" timestamp with time zone,
	"device_hash" text,
	"resume_handle" text,
	"extended_ms" integer DEFAULT 0 NOT NULL,
	"connects" integer DEFAULT 0 NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_sessions_invitation_id_unique" UNIQUE("invitation_id")
);
--> statement-breakpoint
CREATE TABLE "transcript_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"speaker" text NOT NULL,
	"part" text NOT NULL,
	"text" text NOT NULL,
	"at_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "accommodation_note" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "accommodation_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "new_link_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_sessions_role_status_idx" ON "interview_sessions" USING btree ("role_id","status");--> statement-breakpoint
CREATE INDEX "interview_sessions_status_seen_idx" ON "interview_sessions" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turns_session_seq_idx" ON "transcript_turns" USING btree ("session_id","seq");