/**
 * Import CareerSignal_Master_Sources.csv into the companies table.
 * Idempotent: upserts by (normalized_name, type).
 *
 * Run: npm run sources:import
 */
import './load-env';

import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '@careersignal/db';
import {
  upsertCompanyByNormalizedNameAndType,
  type EntityType,
  type InsertCompanyInput,
} from '@careersignal/db';

const CSV_PATH = path.resolve(
  process.cwd(),
  'miscellaneous/sources/CareerSignal_Master_Sources.csv',
);

const BIG_BOARDS_NORMALIZED = new Set([
  'linkedin_jobs',
  'indeed',
  'glassdoor',
  'ziprecruiter',
  'handshake',
  'careershift',
  'interstride',
  'zippia',
]);

const H1B_DATA_SITES_NORMALIZED = new Set(['h1b_salary_database_h1bdata_info', 'h1bgrader']);

function normalizeName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'unknown'
  );
}

function extractDomain(url: string): string | null {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
    const u = new URL(url);
    let host = u.hostname;
    if (host.startsWith('www.')) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

function classifyRow(
  name: string,
  url: string,
  kind: string,
  origin: string,
): { type: EntityType; isPriorityTarget: boolean; enabledForScraping: boolean } {
  const kindLower = kind.trim().toLowerCase();
  const originLower = origin.trim().toLowerCase();
  const norm = normalizeName(name);

  let type: EntityType = 'RESOURCE';
  let isPriorityTarget = false;
  let enabledForScraping = true;

  if (kindLower === 'company_careers' && originLower.includes('master_100')) {
    type = 'COMPANY';
    isPriorityTarget = true;
    enabledForScraping = true;
  } else if (kindLower === 'h1b_job_board_or_resource') {
    type = 'RESOURCE';
    isPriorityTarget = false;
    enabledForScraping = !BIG_BOARDS_NORMALIZED.has(norm) && !H1B_DATA_SITES_NORMALIZED.has(norm);
  } else if (kindLower === 'ats_connector_template') {
    type = 'CONNECTOR_TEMPLATE';
    isPriorityTarget = false;
    enabledForScraping = false;
  } else if (kindLower === 'public_jobs_api' || kindLower === 'community') {
    type = 'SOURCE';
    isPriorityTarget = false;
    enabledForScraping = true;
  } else if (kindLower === 'company_careers') {
    type = 'COMPANY';
    isPriorityTarget = false;
    enabledForScraping = true;
  }

  if (BIG_BOARDS_NORMALIZED.has(norm)) enabledForScraping = false;
  if (H1B_DATA_SITES_NORMALIZED.has(norm)) enabledForScraping = false;

  return { type, isPriorityTarget, enabledForScraping };
}

function parseCsv(content: string): { name: string; url: string; kind: string; origin: string }[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const rows: { name: string; url: string; kind: string; origin: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const parts = line.split(',');
    if (parts.length >= 4) {
      const name = parts.slice(0, -3).join(',').trim();
      const url = parts[parts.length - 3]!.trim();
      const kind = parts[parts.length - 2]!.trim();
      const origin = parts[parts.length - 1]!.trim();
      if (name && url) rows.push({ name, url, kind, origin });
    }
  }
  return rows;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('CSV not found:', CSV_PATH);
    process.exit(1);
  }
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(content);
  console.log(`Parsed ${rows.length} rows from CSV`);

  const db = getDb();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const { type, isPriorityTarget, enabledForScraping } = classifyRow(
      row.name,
      row.url,
      row.kind,
      row.origin,
    );
    const normalizedName = normalizeName(row.name);
    const websiteDomain = extractDomain(row.url);

    const input: InsertCompanyInput = {
      type,
      name: row.name,
      normalizedName,
      url: row.url,
      origin: row.origin || null,
      kind: row.kind || null,
      isPriorityTarget,
      enabledForScraping,
      websiteDomain: websiteDomain ?? null,
    };

    const result = await upsertCompanyByNormalizedNameAndType(db, input);
    if (result.created) inserted++;
    else updated++;
  }

  console.log(`Done. Inserted: ${inserted}, Updated: ${updated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
