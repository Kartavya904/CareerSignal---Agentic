-- Application analysis queue (CSV upload) + run_source on analyses for "From batch" label.

DO $$ BEGIN
  CREATE TYPE "application_analysis_queue_status" AS ENUM('pending', 'running', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "run_source" varchar(16) DEFAULT 'single';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_analysis_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "url" text NOT NULL,
  "status" "application_analysis_queue_status" DEFAULT 'pending' NOT NULL,
  "sequence" integer DEFAULT 0 NOT NULL,
  "analysis_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_analysis_queue" ADD CONSTRAINT "application_analysis_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_analysis_queue" ADD CONSTRAINT "application_analysis_queue_analysis_id_application_assistant_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "application_assistant_analyses"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_analysis_queue_user_status_idx" ON "application_analysis_queue" USING btree ("user_id", "status");
