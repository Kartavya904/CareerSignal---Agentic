-- Minimal companies schema: add sponsorship_rate + hiring_process_description, drop unused columns.

-- 1) Add new enum and columns
DO $$ BEGIN
  CREATE TYPE "sponsorship_rate" AS ENUM('H1B_YES', 'CITIZEN_OR_RESIDENT_ONLY', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "sponsorship_rate" "sponsorship_rate" DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "hiring_process_description" text;

-- 2) Copy typical_hiring_process into hiring_process_description (one-time) then drop old columns
UPDATE "companies"
SET "hiring_process_description" = TRIM("typical_hiring_process")
WHERE "typical_hiring_process" IS NOT NULL AND TRIM("typical_hiring_process") <> '';

-- 3) Drop removed columns
ALTER TABLE "companies" DROP COLUMN IF EXISTS "industries";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "company_stage";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "size_range";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "funding_stage";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "public_company";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "ticker";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "remote_friendly_locations";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "core_values";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "mission_statement";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "benefits_highlights";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "sponsorship_signals";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "typical_hiring_process";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "interview_process";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "interview_format_hints";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "work_authorization_requirements";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "salary_by_level";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "application_tips_from_careers_page";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "long_company_description";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "recent_layoffs_or_restructuring";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "hiring_trend";
