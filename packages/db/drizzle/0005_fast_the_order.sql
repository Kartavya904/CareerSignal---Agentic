DO $$ BEGIN
 CREATE TYPE "ats_type" AS ENUM('GREENHOUSE', 'LEVER', 'ASHBY', 'SMARTRECRUITERS', 'RECRUITEE', 'PERSONIO', 'WORKDAY', 'UNKNOWN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "enrichment_status" AS ENUM('PENDING', 'RUNNING', 'DONE', 'ERROR');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "entity_type" AS ENUM('COMPANY', 'SOURCE', 'CONNECTOR_TEMPLATE', 'RESOURCE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "job_remote_type" AS ENUM('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "job_status" AS ENUM('OPEN', 'CLOSED', 'UNKNOWN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "scrape_status" AS ENUM('OK', 'ERROR', 'BLOCKED', 'CAPTCHA', 'LOGIN_WALL', 'EMPTY', 'SKIPPED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "scrape_strategy" AS ENUM('AUTO', 'API_JSON', 'API_XML', 'BROWSER_FALLBACK');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_assistant_analysis_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"ts" timestamp NOT NULL,
	"agent" varchar(64) NOT NULL,
	"level" varchar(16) NOT NULL,
	"message" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_assistant_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"component" varchar(32) NOT NULL,
	"value" varchar(16) NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"url" text NOT NULL,
	"origin" text,
	"kind" text,
	"is_priority_target" boolean DEFAULT false NOT NULL,
	"enabled_for_scraping" boolean DEFAULT false NOT NULL,
	"parent_company_id" uuid,
	"ats_type" "ats_type" DEFAULT 'UNKNOWN',
	"scrape_strategy" "scrape_strategy" DEFAULT 'AUTO',
	"connector_config" jsonb,
	"last_fingerprinted_at" timestamp,
	"last_scraped_at" timestamp,
	"last_status" "scrape_status",
	"last_error" text,
	"scrape_interval_minutes" integer,
	"scheduler_enabled" boolean DEFAULT false NOT NULL,
	"test_budget" jsonb,
	"description_text" text,
	"enrichment_sources" jsonb,
	"enrichment_status" "enrichment_status" DEFAULT 'PENDING',
	"last_enriched_at" timestamp,
	"industries" jsonb,
	"hq_location" text,
	"size_range" text,
	"founded_year" integer,
	"funding_stage" text,
	"public_company" boolean,
	"ticker" text,
	"remote_policy" text,
	"sponsorship_signals" jsonb,
	"hiring_locations" jsonb,
	"tech_stack_hints" jsonb,
	"website_domain" text,
	"job_count_total" integer DEFAULT 0 NOT NULL,
	"job_count_open" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"title" text NOT NULL,
	"location" text,
	"remote_type" "job_remote_type" DEFAULT 'UNKNOWN',
	"employment_type" text,
	"level" text,
	"job_url" text,
	"apply_url" text,
	"external_id" text,
	"description_text" text,
	"description_html" text,
	"posted_at" timestamp,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"status" "job_status" DEFAULT 'OPEN',
	"dedupe_key" text NOT NULL,
	"raw_extract" jsonb,
	"evidence_paths" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_listings_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_observations" (
	"job_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"observed_url" text,
	"observed_at" timestamp DEFAULT now() NOT NULL,
	"content_hash" text
);
--> statement-breakpoint
DROP TABLE "admin_agent_logs";--> statement-breakpoint
DROP TABLE "admin_brain_logs";--> statement-breakpoint
DROP TABLE "blessed_sources";--> statement-breakpoint
DROP TABLE "job_listings_cache";--> statement-breakpoint
DROP TABLE "scrape_state";--> statement-breakpoint
DROP TABLE "scrape_visited_urls";--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_job_listing_cache_id_job_listings_cache_id_fk";
--> statement-breakpoint
ALTER TABLE "sources" DROP CONSTRAINT "sources_blessed_source_id_blessed_sources_id_fk";
--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ALTER COLUMN "match_score" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ADD COLUMN "match_rationale" text;--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ADD COLUMN "strict_filter_rejects" jsonb;--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ADD COLUMN "company_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ADD COLUMN "run_status" varchar(16);--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ADD COLUMN "current_step" varchar(32);--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ADD COLUMN "waiting_for_login" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ADD COLUMN "waiting_for_captcha" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "application_assistant_analyses" ADD COLUMN "run_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "willing_to_relocate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "has_car" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_type_idx" ON "companies" ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_is_priority_target_idx" ON "companies" ("is_priority_target");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_ats_type_idx" ON "companies" ("ats_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_company_status_idx" ON "job_listings" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_last_seen_idx" ON "job_listings" ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_observations_job_source_unique" ON "job_observations" ("job_id","source_id");--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "job_listing_cache_id";--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN IF EXISTS "blessed_source_id";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_assistant_analysis_logs" ADD CONSTRAINT "application_assistant_analysis_logs_analysis_id_application_assistant_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "application_assistant_analyses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_assistant_feedback" ADD CONSTRAINT "application_assistant_feedback_analysis_id_application_assistant_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "application_assistant_analyses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_assistant_feedback" ADD CONSTRAINT "application_assistant_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_listings" ADD CONSTRAINT "job_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_observations" ADD CONSTRAINT "job_observations_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "job_listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_observations" ADD CONSTRAINT "job_observations_source_id_companies_id_fk" FOREIGN KEY ("source_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
