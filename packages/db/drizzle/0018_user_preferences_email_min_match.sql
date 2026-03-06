-- Optional minimum match score (0-100) for email agent.

ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "email_min_match_score" numeric(5,2);

