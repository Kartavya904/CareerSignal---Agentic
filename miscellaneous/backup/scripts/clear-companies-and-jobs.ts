/**
 * Danger: wipe all companies and their jobs.
 *
 * This clears job_observations, job_listings, and companies so you can
 * repopulate companies purely from scraping runs instead of the CSV.
 *
 * Run: npx tsx scripts/clear-companies-and-jobs.ts
 */
import './load-env';

import { getDb, jobListings, jobObservations, companies } from '@careersignal/db';

async function main() {
  const db = getDb();

  console.log('Deleting job_observations…');
  await db.delete(jobObservations);

  console.log('Deleting job_listings…');
  await db.delete(jobListings);

  console.log('Deleting companies…');
  await db.delete(companies);

  console.log('Done. All companies and related jobs have been removed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
