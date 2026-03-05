-- Companies table refresh: clear all companies, drop unused scraping/ops columns,
-- replace hq_location with headquarters_and_offices, add new skeleton columns.
-- Run this when you want to start fresh with the new company schema.

-- 1) Clear dependent data then all companies (start fresh)
DELETE FROM "job_observations";
--> statement-breakpoint
DELETE FROM "job_listings";
--> statement-breakpoint
DELETE FROM "companies";
--> statement-breakpoint

-- 2) Drop unused scraping/ops columns
ALTER TABLE "companies" DROP COLUMN IF EXISTS "connector_config";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "last_fingerprinted_at";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "last_scraped_at";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "last_status";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "last_error";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "scrape_interval_minutes";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "scheduler_enabled";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "test_budget";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "scrape_strategy";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "hq_location";
--> statement-breakpoint

-- 3) Add new columns (skeleton from docs/companies-table-skeleton.md)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "headquarters_and_offices" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "company_stage" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "remote_friendly_locations" jsonb;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "careers_page_url" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "linkedin_company_url" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "core_values" jsonb;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "mission_statement" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "benefits_highlights" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "typical_hiring_process" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "interview_process" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "interview_format_hints" jsonb;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "salary_by_level" jsonb;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "application_tips_from_careers_page" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "work_authorization_requirements" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "long_company_description" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "recent_layoffs_or_restructuring" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "hiring_trend" text;
