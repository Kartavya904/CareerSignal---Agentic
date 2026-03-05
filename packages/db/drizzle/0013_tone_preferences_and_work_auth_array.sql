-- Work authorization: add array column; backfill from single enum; keep enum for backward compat (sync first element on write).
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "work_authorizations" jsonb DEFAULT '[]';
--> statement-breakpoint
UPDATE "user_preferences"
SET work_authorizations = jsonb_build_array(work_authorization::text)
WHERE work_authorizations IS NULL OR work_authorizations = '[]';
--> statement-breakpoint
-- Cover letter tone preferences
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cover_letter_tone" jsonb DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cover_letter_length" varchar(32) DEFAULT 'DEFAULT';
--> statement-breakpoint
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cover_letter_word_choice" jsonb DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cover_letter_notes" text;
--> statement-breakpoint
-- Cold message (LinkedIn) tone preferences
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cold_linkedin_tone" jsonb DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cold_linkedin_length" varchar(32) DEFAULT 'SHORT';
--> statement-breakpoint
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cold_linkedin_notes" text;
--> statement-breakpoint
-- Cold email tone preferences
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cold_email_tone" jsonb DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cold_email_length" varchar(32) DEFAULT 'SHORT';
--> statement-breakpoint
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "cold_email_notes" text;
