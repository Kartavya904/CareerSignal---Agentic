/**
 * Fetch a company by name from the companies table and list which fields are empty
 * (could be filled by deep research / scraping).
 * Run from repo root: npx tsx scripts/show-company-empty-fields.ts [CompanyName]
 * Default: Google
 */
import './load-env';
import pg from 'pg';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });
config();

const companyName = process.argv[2] ?? 'Google';
const normalized = companyName
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')
  .trim();

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query('SELECT * FROM companies WHERE normalized_name = $1 LIMIT 1', [
    normalized,
  ]);
  await pool.end();

  const row = rows[0];
  if (!row) {
    console.log(`No company found with name "${companyName}" (normalized: ${normalized}).`);
    process.exit(1);
  }

  const r = row as Record<string, unknown>;
  const keys = Object.keys(r).sort();

  /** System columns to exclude from "could be scraped" (not content). */
  const systemKeys = [
    'id',
    'created_at',
    'updated_at',
    'last_enriched_at',
    'parent_company_id',
    'is_priority_target',
    'enabled_for_scraping',
    'ats_type',
    'type',
    'kind',
    'origin',
  ];
  const contentKeys = keys.filter((k) => !systemKeys.includes(k));

  const empty: string[] = [];
  const filled: string[] = [];

  console.log(`\n--- ${(r.name as string) ?? companyName} ---\n`);

  for (const k of contentKeys) {
    const v = r[k];
    let isEmpty =
      v === null ||
      v === undefined ||
      (typeof v === 'string' && v.trim() === '') ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === 'object' &&
        v !== null &&
        !Array.isArray(v) &&
        !(v instanceof Date) &&
        Object.keys(v).length === 0);
    // sponsorship_rate: UNKNOWN counts as empty for reporting
    if (!isEmpty && k === 'sponsorship_rate' && v === 'UNKNOWN') isEmpty = true;

    if (isEmpty) {
      empty.push(k);
    } else {
      filled.push(k);
    }

    const display =
      v === null || v === undefined
        ? '(empty)'
        : typeof v === 'string'
          ? v.length > 100
            ? v.slice(0, 97) + '...'
            : v
          : Array.isArray(v)
            ? `[${v.length} items]`
            : typeof v === 'object' && v !== null
              ? JSON.stringify(v).length > 80
                ? JSON.stringify(v).slice(0, 77) + '...'
                : JSON.stringify(v)
              : String(v);
    console.log(`${k}: ${display}`);
  }

  console.log('\n--- Summary ---');
  console.log(`Filled: ${filled.length} content fields`);
  console.log(`Empty (could be scraped / filled by deep research): ${empty.length} fields`);
  if (empty.length > 0) {
    console.log('\nEmpty content fields:\n  ' + empty.join('\n  '));
  }

  // Minimal schema priority (snake_case for DB columns).
  const MUST_HAVE = [
    'description_text',
    'careers_page_url',
    'linkedin_company_url',
    'headquarters_and_offices',
    'remote_policy',
    'hiring_locations',
  ];
  const SHOULD_HAVE = ['hiring_process_description', 'founded_year'];
  const NICE_TO_HAVE = ['tech_stack_hints', 'sponsorship_rate'];
  const emptySet = new Set(empty);
  const missingMust = MUST_HAVE.filter((k) => emptySet.has(k));
  const missingShould = SHOULD_HAVE.filter((k) => emptySet.has(k));
  const missingNice = NICE_TO_HAVE.filter((k) => emptySet.has(k));
  if (missingMust.length > 0 || missingShould.length > 0 || missingNice.length > 0) {
    console.log('\n--- Empty by priority (must → should → nice) ---');
    if (missingMust.length > 0) console.log('Must-have missing: ' + missingMust.join(', '));
    if (missingShould.length > 0) console.log('Should-have missing: ' + missingShould.join(', '));
    if (missingNice.length > 0) console.log('Nice-to-have missing: ' + missingNice.join(', '));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
