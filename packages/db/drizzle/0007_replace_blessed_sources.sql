-- Replace blessed sources with scraper-friendly defaults.
-- Deletes existing rows (job_listings_cache rows cascade-delete via FK).
-- Then inserts the new default list.

DELETE FROM blessed_sources;

INSERT INTO blessed_sources (id, name, url, type, slug, enabled_for_scraping, scrape_interval_minutes, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'We Work Remotely', 'https://weworkremotely.com/', 'AGGREGATOR', 'weworkremotely', true, 1440, now(), now()),
  (gen_random_uuid(), 'Remote OK', 'https://remoteok.com/', 'AGGREGATOR', 'remoteok', true, 1440, now(), now()),
  (gen_random_uuid(), 'Stack Overflow Jobs', 'https://stackoverflowjobs.com', 'AGGREGATOR', 'stackoverflow_jobs', true, 1440, now(), now()),
  (gen_random_uuid(), 'Wellfound (AngelList)', 'https://wellfound.com/jobs', 'AGGREGATOR', 'wellfound', true, 1440, now(), now()),
  (gen_random_uuid(), 'Jobicy', 'https://jobicy.com/', 'AGGREGATOR', 'jobicy', true, 1440, now(), now()),
  (gen_random_uuid(), 'Authentic Jobs', 'https://authenticjobs.com/', 'AGGREGATOR', 'authentic_jobs', true, 1440, now(), now()),
  (gen_random_uuid(), 'JustRemote', 'https://justremote.co/remote-jobs', 'AGGREGATOR', 'justremote', true, 1440, now(), now()),
  (gen_random_uuid(), 'Work at a Startup (YC)', 'https://www.workatastartup.com/jobs', 'AGGREGATOR', 'workatastartup', true, 1440, now(), now()),
  (gen_random_uuid(), 'The Muse', 'https://www.themuse.com/jobs', 'AGGREGATOR', 'themuse', true, 1440, now(), now()),
  (gen_random_uuid(), 'Hacker News Who''s Hiring', 'https://news.ycombinator.com/jobs', 'COMMUNITY', 'hn_who_is_hiring', true, 1440, now(), now());
