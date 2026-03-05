/**
 * Delete all rows from the companies table.
 * - Sets job_listings.company_id to NULL (FK on delete set null).
 * - Deletes job_observations and contacts that reference companies (FK on delete cascade).
 * - Clears parent_company_id on companies first so the self-FK doesn't block deletion.
 *
 * Run from repo root: npx tsx scripts/delete-all-companies.ts
 */
import './load-env';
import { getDb, companies } from '@careersignal/db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  const [countBefore] = await db.select({ count: sql<number>`count(*)::int` }).from(companies);
  const n = countBefore?.count ?? 0;

  if (n === 0) {
    console.log('No companies in the database. Nothing to delete.');
    process.exit(0);
  }

  console.log(`Found ${n} company row(s). Clearing parent_company_id then deleting...`);

  await db.update(companies).set({ parentCompanyId: null });
  await db.delete(companies);

  console.log('Done. Deleted all companies.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
