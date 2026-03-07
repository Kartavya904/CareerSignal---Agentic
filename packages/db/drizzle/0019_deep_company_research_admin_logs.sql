-- Admin: deep company research runs + logs so UI can restore state when returning to the page.

DO $$ BEGIN
  CREATE TYPE "deep_company_research_run_status" AS ENUM('running', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deep_company_research_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status" "deep_company_research_run_status" DEFAULT 'running' NOT NULL,
  "company_name" text NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deep_company_research_admin_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "ts" timestamp NOT NULL,
  "level" varchar(16) NOT NULL,
  "message" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deep_company_research_admin_logs" ADD CONSTRAINT "deep_company_research_admin_logs_run_id_deep_company_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "deep_company_research_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deep_company_research_admin_logs_run_id_idx" ON "deep_company_research_admin_logs" USING btree ("run_id");
