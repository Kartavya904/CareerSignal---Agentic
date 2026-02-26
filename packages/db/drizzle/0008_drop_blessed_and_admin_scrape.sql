-- Drop FKs and columns that reference removed tables
ALTER TABLE "sources" DROP CONSTRAINT IF EXISTS "sources_blessed_source_id_blessed_sources_id_fk";
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_job_listing_cache_id_job_listings_cache_id_fk";

ALTER TABLE "sources" DROP COLUMN IF EXISTS "blessed_source_id";
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "job_listing_cache_id";

-- Drop admin/blessed-related tables
DROP TABLE IF EXISTS "scrape_visited_urls";
DROP TABLE IF EXISTS "job_listings_cache";
DROP TABLE IF EXISTS "blessed_sources";
DROP TABLE IF EXISTS "admin_agent_logs";
DROP TABLE IF EXISTS "admin_brain_logs";
DROP TABLE IF EXISTS "scrape_state";

-- Add admin flag to users and grant admin to the specified email
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin" boolean DEFAULT false NOT NULL;

UPDATE "users"
SET "admin" = true
WHERE "email" = 'singhk6@mail.uc.edu';

