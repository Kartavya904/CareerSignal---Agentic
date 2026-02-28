-- Phase 15: evidence per main card for Evidence modal (match, resume, cover letters, contacts).
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "match_evidence" jsonb;
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "resume_evidence" jsonb;
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "cover_letters_evidence" jsonb;
ALTER TABLE "application_assistant_analyses" ADD COLUMN IF NOT EXISTS "contacts_evidence" jsonb;
