-- Remove log and feedback rows whose analysis_id no longer exists in application_assistant_analyses.
-- Run this once if db:push fails with FK violation on application_assistant_analysis_logs.
-- Usage: psql $DATABASE_URL -f packages/db/scripts/delete-orphan-logs.sql

DELETE FROM application_assistant_analysis_logs
WHERE analysis_id NOT IN (SELECT id FROM application_assistant_analyses);

DELETE FROM application_assistant_feedback
WHERE analysis_id NOT IN (SELECT id FROM application_assistant_analyses);
