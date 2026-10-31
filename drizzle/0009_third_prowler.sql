CREATE TYPE "public"."invitation_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'opened', 'started', 'completed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"email" text NOT NULL,
	"channel" text NOT NULL,
	"status" "invitation_status" DEFAULT 'queued' NOT NULL,
	"token_hash" text,
	"expires_in_hours" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"note" text,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"provider_message_id" text,
	"dev_preview" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_candidate_id_unique" UNIQUE("candidate_id"),
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_role_status_idx" ON "invitations" USING btree ("role_id","status");--> statement-breakpoint
CREATE INDEX "invitations_owner_sent_idx" ON "invitations" USING btree ("owner_id","sent_at");