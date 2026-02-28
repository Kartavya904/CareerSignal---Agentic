-- Phase 13/14: ensure application_assistant_analyses has match_rationale, strict_filter_rejects, and match_score as decimal.
-- Safe to run even if 0005 was partially applied (uses IF NOT EXISTS / exception handling).

DO $$ BEGIN
  ALTER TABLE "application_assistant_analyses" ALTER COLUMN "match_score" SET DATA TYPE numeric(5, 2) USING match_score::numeric(5, 2);
EXCEPTION
  WHEN others THEN NULL; -- column may already be numeric
END $$;

ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "match_rationale" text;
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "strict_filter_rejects" jsonb;
