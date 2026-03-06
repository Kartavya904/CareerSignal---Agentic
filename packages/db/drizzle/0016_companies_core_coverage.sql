-- Track Deep Company Dossier core coverage for scheduling top-ups.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "core_field_coverage" decimal(4,3);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "missing_core_fields" jsonb;

