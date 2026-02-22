DO $$ BEGIN
 CREATE TYPE "last_scrape_status" AS ENUM('SUCCESS', 'FAILED', 'PARTIAL');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blessed_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"type" "source_type" NOT NULL,
	"slug" varchar(64),
	"enabled_for_scraping" boolean DEFAULT true NOT NULL,
	"scrape_interval_minutes" integer,
	"last_scraped_at" timestamp,
	"last_scrape_status" "last_scrape_status",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_listings_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blessed_source_id" uuid NOT NULL,
	"title" varchar(512) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"source_url" text NOT NULL,
	"location" varchar(255),
	"remote_type" varchar(32),
	"seniority" "seniority",
	"employment_type" "employment_type",
	"visa_sponsorship" varchar(16),
	"description" text,
	"requirements" jsonb,
	"posted_date" date,
	"salary_min" numeric(12, 2),
	"salary_max" numeric(12, 2),
	"salary_currency" varchar(8),
	"department" varchar(255),
	"team" varchar(255),
	"apply_url" text,
	"raw_extract" jsonb,
	"evidence_refs" jsonb,
	"confidence" numeric(3, 2),
	"dedupe_key" varchar(256) NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resume_uploaded_at" timestamp,
	"resume_parsed_at" timestamp,
	"insights_generated_at" timestamp,
	"profile_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_metadata_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "job_listing_cache_id" uuid;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "blessed_source_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_listings_cache_blessed_dedupe_idx" ON "job_listings_cache" ("blessed_source_id","dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_cache_blessed_last_seen_idx" ON "job_listings_cache" ("blessed_source_id","last_seen_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_job_listing_cache_id_job_listings_cache_id_fk" FOREIGN KEY ("job_listing_cache_id") REFERENCES "job_listings_cache"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sources" ADD CONSTRAINT "sources_blessed_source_id_blessed_sources_id_fk" FOREIGN KEY ("blessed_source_id") REFERENCES "blessed_sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_listings_cache" ADD CONSTRAINT "job_listings_cache_blessed_source_id_blessed_sources_id_fk" FOREIGN KEY ("blessed_source_id") REFERENCES "blessed_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_metadata" ADD CONSTRAINT "user_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
