-- Email updates flag for Application Assistant / outreach.

ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "email_updates_enabled" boolean NOT NULL DEFAULT false;

