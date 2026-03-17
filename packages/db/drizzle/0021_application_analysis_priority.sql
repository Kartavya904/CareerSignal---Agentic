-- Per-user priority flag for Application Analysis CSV queue rotation.

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "application_analysis_priority" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_application_analysis_priority_idx"
ON "users" USING btree ("application_analysis_priority");

