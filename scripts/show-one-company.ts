/**
 * Fetch one row from the companies table and print all columns with their values.
 * Run from repo root: npx tsx scripts/show-one-company.ts
 */
import { getDb, companies } from '@careersignal/db';
import { desc } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const [row] = await db.select().from(companies).orderBy(desc(companies.updatedAt)).limit(1);

  if (!row) {
    console.log('No companies in the database.');
    return;
  }

  console.log('--- One company row (columns and current values) ---\n');
  const r = row as Record<string, unknown>;
  const keys = Object.keys(r).sort();
  for (const k of keys) {
    const v = r[k];
    const display =
      v === null || v === undefined
        ? '(null/empty)'
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v);
    const truncated = display.length > 120 ? display.slice(0, 117) + '...' : display;
    console.log(`${k}: ${truncated}`);
  }
  console.log('\n--- End ---');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
