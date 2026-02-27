/**
 * Truncate data in companies, job_listings, job_observations, and jobs tables.
 * Use after scope pivot to start fresh (Application Assistant only; no bulk scraping).
 *
 * Run: npx tsx scripts/truncate-scraping-data.ts
 */
import './load-env';

import {
  getDb,
  jobObservations,
  jobListings,
  jobs,
  companies,
} from '@careersignal/db';

async function main() {
  const db = getDb();

  console.log('Deleting job_observations…');
  await db.delete(jobObservations);

  console.log('Deleting job_listings…');
  await db.delete(jobListings);

  console.log('Deleting jobs (run-linked)…');
  await db.delete(jobs);

  console.log('Deleting companies…');
  await db.delete(companies);

  console.log('Done. Companies and job-postings data cleared.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
