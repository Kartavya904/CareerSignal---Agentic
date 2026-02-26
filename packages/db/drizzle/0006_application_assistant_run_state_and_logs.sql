-- Run state on analysis row
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "run_status" varchar(16);
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "current_step" varchar(32);
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "waiting_for_login" boolean DEFAULT false;
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "waiting_for_captcha" boolean DEFAULT false;
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "run_updated_at" timestamp;

-- Logs table for Application Assistant runs
CREATE TABLE IF NOT EXISTS "application_assistant_analysis_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "ts" timestamp NOT NULL,
  "agent" varchar(64) NOT NULL,
  "level" varchar(16) NOT NULL,
  "message" text NOT NULL,
  "detail" text
);
ALTER TABLE "application_assistant_analysis_logs" ADD CONSTRAINT "application_assistant_analysis_logs_analysis_id_application_assistant_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "application_assistant_analyses"("id") ON DELETE cascade ON UPDATE no action;
