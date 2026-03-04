-- Contacts table: confirmed contacts from outreach runs or manual entry, for reuse (e.g. same company, different role).
DO $$ BEGIN
  CREATE TYPE "contact_source" AS ENUM('outreach_run', 'manual', 'reuse');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "contact_status" AS ENUM('pending', 'confirmed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "role" text,
  "email" text,
  "linkedin_url" text,
  "archetype" varchar(32),
  "source" "contact_source" DEFAULT 'outreach_run' NOT NULL,
  "confidence" decimal(3, 2),
  "evidence" jsonb,
  "status" "contact_status" DEFAULT 'pending' NOT NULL,
  "last_used_at" timestamp,
  "used_for_job_ids" jsonb DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "contacts_company_id_idx" ON "contacts" ("company_id");
CREATE INDEX IF NOT EXISTS "contacts_status_idx" ON "contacts" ("status");
