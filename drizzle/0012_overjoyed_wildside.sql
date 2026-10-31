CREATE TYPE "public"."plan_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "candidate_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"status" "plan_status" DEFAULT 'pending' NOT NULL,
	"plan" jsonb,
	"blueprint" jsonb NOT NULL,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_interviews_candidate_id_unique" UNIQUE("candidate_id")
);
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "blueprint" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_interviews" ADD CONSTRAINT "candidate_interviews_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_interviews" ADD CONSTRAINT "candidate_interviews_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_interviews" ADD CONSTRAINT "candidate_interviews_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_interviews_role_idx" ON "candidate_interviews" USING btree ("role_id","status");