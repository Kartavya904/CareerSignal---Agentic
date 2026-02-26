/**
 * Danger: wipe all job postings (but keep companies).
 *
 * This clears job_observations and job_listings, then resets job counts
 * on all companies so you can rerun scraping cleanly.
 *
 * Run: npx tsx scripts/clear-jobs.ts
 */
import './load-env';

import { getDb, jobListings, jobObservations, companies } from '@careersignal/db';

async function main() {
  const db = getDb();

  console.log('Deleting job_observations…');
  await db.delete(jobObservations);

  console.log('Deleting job_listings…');
  await db.delete(jobListings);

  console.log('Resetting job counts on companies…');
  await db
    .update(companies)
    .set({
      jobCountTotal: 0,
      jobCountOpen: 0,
      lastScrapedAt: null,
      lastStatus: null,
      lastError: null,
    });

  console.log('Done. All job postings cleared; companies retained.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
