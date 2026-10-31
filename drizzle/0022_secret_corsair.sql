CREATE TYPE "public"."job_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "company_intel" (
	"key" text PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"role_cluster" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"intel" jsonb,
	"model" text,
	"error" text,
	"refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drill_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"item" text NOT NULL,
	"result" jsonb NOT NULL,
	"score" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"role_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"role_title" text NOT NULL,
	"job_description" text NOT NULL,
	"resume_text" text NOT NULL,
	"resume_key" text NOT NULL,
	"resume_file_type" text NOT NULL,
	"resume_sha256" text NOT NULL,
	"intel_key" text NOT NULL,
	"interview_date" timestamp with time zone,
	"minutes_per_day" integer DEFAULT 30 NOT NULL,
	"level" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"questions" jsonb,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score" real,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_checks_goal_id_unique" UNIQUE("goal_id")
);
--> statement-breakpoint
CREATE TABLE "mocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"resume_text" text NOT NULL,
	"focus" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mocks_candidate_id_unique" UNIQUE("candidate_id")
);
--> statement-breakpoint
CREATE TABLE "pack_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"link_id" uuid,
	"view_id" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"code" text NOT NULL,
	"channel" text NOT NULL,
	"label" text NOT NULL,
	"replied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_links_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "plan_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"content" jsonb,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"ideas" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proof_ideas_goal_id_unique" UNIQUE("goal_id")
);
--> statement-breakpoint
CREATE TABLE "proof_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"kit" jsonb,
	"video_key" text,
	"video_url" text,
	"contact_url" text,
	"published_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proof_packs_goal_id_unique" UNIQUE("goal_id"),
	CONSTRAINT "proof_packs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "proof_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"company_key" text NOT NULL,
	"idea_key" text NOT NULL,
	"idea" jsonb NOT NULL,
	"repo_url" text,
	"demo_url" text,
	"summary" text DEFAULT '' NOT NULL,
	"milestones_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proof_projects_goal_id_unique" UNIQUE("goal_id")
);
--> statement-breakpoint
CREATE TABLE "readiness_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"source" text NOT NULL,
	"overall" integer NOT NULL,
	"rounds" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"plan" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_plans_goal_id_unique" UNIQUE("goal_id")
);
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "drill_attempts" ADD CONSTRAINT "drill_attempts_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_checks" ADD CONSTRAINT "level_checks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mocks" ADD CONSTRAINT "mocks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mocks" ADD CONSTRAINT "mocks_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mocks" ADD CONSTRAINT "mocks_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_events" ADD CONSTRAINT "pack_events_pack_id_proof_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."proof_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_events" ADD CONSTRAINT "pack_events_link_id_pack_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."pack_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_links" ADD CONSTRAINT "pack_links_pack_id_proof_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."proof_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_ideas" ADD CONSTRAINT "proof_ideas_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_packs" ADD CONSTRAINT "proof_packs_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_projects" ADD CONSTRAINT "proof_projects_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_snapshots" ADD CONSTRAINT "readiness_snapshots_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_attempts_goal_idx" ON "drill_attempts" USING btree ("goal_id","day","item");--> statement-breakpoint
CREATE INDEX "goals_owner_created_idx" ON "goals" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mocks_goal_idx" ON "mocks" USING btree ("goal_id","created_at");--> statement-breakpoint
CREATE INDEX "pack_events_pack_created_idx" ON "pack_events" USING btree ("pack_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "pack_events_view_kind_idx" ON "pack_events" USING btree ("view_id","kind");--> statement-breakpoint
CREATE INDEX "pack_links_pack_idx" ON "pack_links" USING btree ("pack_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_days_goal_day_idx" ON "plan_days" USING btree ("goal_id","day");--> statement-breakpoint
CREATE INDEX "proof_projects_slot_idx" ON "proof_projects" USING btree ("company_key","idea_key");--> statement-breakpoint
CREATE INDEX "readiness_goal_created_idx" ON "readiness_snapshots" USING btree ("goal_id","created_at");