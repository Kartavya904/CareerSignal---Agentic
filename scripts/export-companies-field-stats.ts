/**
 * Export all companies and compute field presence/missing stats across the table.
 * Use this to see which fields are empty for most rows and to plan a minimal schema
 * for Application Assistant and Contact Outreach.
 *
 * Outputs:
 * - companies-field-stats.json: per-field fill counts, % filled, and per-row empty/filled lists.
 * - README in the same folder explaining "minimal fields" used by AA and Outreach.
 *
 * Run from repo root: npx tsx scripts/export-companies-field-stats.ts
 * Optional: OUTPUT_DIR=./scripts/out npx tsx scripts/export-companies-field-stats.ts
 */

import './load-env';
import { getDb, companies } from '@careersignal/db';
import * as fs from 'fs';
import * as path from 'path';

/** DB column name (camelCase from Drizzle) -> snake_case for reports. Minimal schema. */
const CAMEL_TO_SNAKE: Record<string, string> = {
  descriptionText: 'description_text',
  enrichmentSources: 'enrichment_sources',
  enrichmentStatus: 'enrichment_status',
  lastEnrichedAt: 'last_enriched_at',
  normalizedName: 'normalized_name',
  parentCompanyId: 'parent_company_id',
  isPriorityTarget: 'is_priority_target',
  enabledForScraping: 'enabled_for_scraping',
  headquartersAndOffices: 'headquarters_and_offices',
  foundedYear: 'founded_year',
  remotePolicy: 'remote_policy',
  careersPageUrl: 'careers_page_url',
  linkedInCompanyUrl: 'linkedin_company_url',
  sponsorshipRate: 'sponsorship_rate',
  hiringProcessDescription: 'hiring_process_description',
  hiringLocations: 'hiring_locations',
  techStackHints: 'tech_stack_hints',
  websiteDomain: 'website_domain',
  jobCountTotal: 'job_count_total',
  jobCountOpen: 'job_count_open',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

function toSnake(key: string): string {
  return (
    CAMEL_TO_SNAKE[key] ??
    key
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  );
}

/** System columns to exclude from "content" (not filled by research). */
const SYSTEM_KEYS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'lastEnrichedAt',
  'parentCompanyId',
  'isPriorityTarget',
  'enabledForScraping',
  'atsType',
  'type',
  'kind',
  'origin',
]);

function isEmpty(v: unknown, key: string): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    Object.keys(v).length === 0
  )
    return true;
  // sponsorship_rate: UNKNOWN counts as empty
  if (key === 'sponsorshipRate' && v === 'UNKNOWN') return true;
  return false;
}

/** Priority tiers (minimal schema). */
const MUST_HAVE = [
  'descriptionText',
  'careersPageUrl',
  'linkedInCompanyUrl',
  'headquartersAndOffices',
  'remotePolicy',
  'hiringLocations',
];
const SHOULD_HAVE = ['hiringProcessDescription', 'foundedYear'];
const NICE_TO_HAVE = ['techStackHints', 'sponsorshipRate'];

/** Fields actually used by Application Assistant (toCompanySnapshot + companyResearch). Minimal schema. */
const USED_BY_APPLICATION_ASSISTANT = new Set([
  'name',
  'url',
  'descriptionText',
  'headquartersAndOffices',
  'foundedYear',
  'remotePolicy',
  'sponsorshipRate',
  'hiringLocations',
  'techStackHints',
  'jobCountTotal',
  'jobCountOpen',
  'websiteDomain',
  'enrichmentSources',
  'lastEnrichedAt',
]);

/** Fields used by Contact Outreach agent (runOutreachResearch company payload). */
const USED_BY_OUTREACH = new Set(['id', 'name', 'websiteDomain', 'descriptionText']);

async function main() {
  const db = getDb();
  const rows = await db.select().from(companies);
  const total = rows.length;

  // Content columns (research-filled); when table is empty use known schema list
  const knownContentKeys = [
    'name',
    'normalizedName',
    'url',
    'descriptionText',
    'enrichmentSources',
    'enrichmentStatus',
    'headquartersAndOffices',
    'foundedYear',
    'remotePolicy',
    'careersPageUrl',
    'linkedInCompanyUrl',
    'sponsorshipRate',
    'hiringProcessDescription',
    'hiringLocations',
    'techStackHints',
    'websiteDomain',
    'jobCountTotal',
    'jobCountOpen',
  ];
  const sample = (rows[0] ?? {}) as Record<string, unknown>;
  const contentKeys =
    total > 0
      ? (Object.keys(sample).filter((k) => !SYSTEM_KEYS.has(k)) as string[])
      : knownContentKeys;
  const fieldCountFilled: Record<string, number> = {};
  const fieldCountMissing: Record<string, number> = {};
  for (const k of contentKeys) {
    fieldCountFilled[k] = 0;
    fieldCountMissing[k] = 0;
  }

  const perRow: Array<{
    id: string;
    name: string;
    normalizedName: string;
    type: string;
    empty: string[];
    filled: string[];
    emptyByTier: { must: string[]; should: string[]; nice: string[] };
  }> = [];

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const empty: string[] = [];
    const filled: string[] = [];
    for (const k of contentKeys) {
      const v = r[k];
      if (isEmpty(v, k)) {
        empty.push(k);
        fieldCountMissing[k]++;
      } else {
        filled.push(k);
        fieldCountFilled[k]++;
      }
    }
    const emptySet = new Set(empty);
    perRow.push({
      id: (r.id as string) ?? '',
      name: (r.name as string) ?? '',
      normalizedName: (r.normalizedName as string) ?? '',
      type: (r.type as string) ?? '',
      empty,
      filled,
      emptyByTier: {
        must: MUST_HAVE.filter((x) => emptySet.has(x)),
        should: SHOULD_HAVE.filter((x) => emptySet.has(x)),
        nice: NICE_TO_HAVE.filter((x) => emptySet.has(x)),
      },
    });
  }

  const fieldStats: Array<{
    field: string;
    fieldSnake: string;
    filled: number;
    missing: number;
    pctFilled: number;
    usedByAA: boolean;
    usedByOutreach: boolean;
  }> = contentKeys.map((field) => ({
    field,
    fieldSnake: toSnake(field),
    filled: fieldCountFilled[field],
    missing: fieldCountMissing[field],
    pctFilled: total > 0 ? Math.round((fieldCountFilled[field] / total) * 100) : 0,
    usedByAA: USED_BY_APPLICATION_ASSISTANT.has(field),
    usedByOutreach: USED_BY_OUTREACH.has(field),
  }));

  // Sort by fill rate ascending (most missing first)
  fieldStats.sort((a, b) => a.pctFilled - b.pctFilled);

  const outDir = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), 'scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const output = {
    generatedAt: new Date().toISOString(),
    totalCompanies: total,
    contentFields: contentKeys.length,
    fieldStats,
    perRowSummary: perRow.map((p) => ({
      id: p.id,
      name: p.name,
      normalizedName: p.normalizedName,
      type: p.type,
      emptyCount: p.empty.length,
      filledCount: p.filled.length,
      emptyByTier: p.emptyByTier,
    })),
    perRowFull: perRow,
    priorityTiers: {
      mustHave: MUST_HAVE.map(toSnake),
      shouldHave: SHOULD_HAVE.map(toSnake),
      niceToHave: NICE_TO_HAVE.map(toSnake),
    },
    usedByApplicationAssistant: [...USED_BY_APPLICATION_ASSISTANT].map(toSnake),
    usedByOutreach: [...USED_BY_OUTREACH],
  };

  const jsonPath = path.join(outDir, 'companies-field-stats.json');
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Wrote ${jsonPath}`);

  // Human-readable summary to stdout and a small markdown file
  const summaryPath = path.join(outDir, 'companies-field-stats-summary.md');
  const lines: string[] = [
    '# Companies table – field presence summary',
    '',
    `Generated: ${output.generatedAt}`,
    `Total companies: ${total}`,
    '',
    '## Fill rate by field (ascending: most missing first)',
    '',
    '| Field (snake_case) | Filled | Missing | % Filled | Used by AA | Used by Outreach |',
    '|--------------------|--------|---------|----------|-------------|------------------|',
  ];
  for (const s of fieldStats) {
    lines.push(
      `| ${s.fieldSnake} | ${s.filled} | ${s.missing} | ${s.pctFilled}% | ${s.usedByAA ? 'Yes' : ''} | ${s.usedByOutreach ? 'Yes' : ''} |`,
    );
  }
  lines.push('');
  lines.push('## Minimal schema recommendation');
  lines.push('');
  lines.push(
    '**Application Assistant** uses: `companySnapshot` (UI card) built from a subset of company fields, and `companyResearch` = `descriptionText` for cover letter / interview prep. See `toCompanySnapshot()` in `apps/web/lib/application-assistant-runner.ts`.',
  );
  lines.push('');
  lines.push(
    '**Contact Outreach** uses only: `id`, `name`, `websiteDomain`, `descriptionText` (see `runOutreachResearch` in application-assistant-runner and outreach API routes).',
  );
  lines.push('');
  lines.push(
    'To make the companies table minimal and research faster, consider keeping only fields marked "Used by AA" or "Used by Outreach", plus identifiers and enrichment metadata: `id`, `type`, `name`, `normalizedName`, `url`, `origin`, `websiteDomain`, `descriptionText`, `enrichmentStatus`, `lastEnrichedAt`, and the snapshot fields (industries, sizeRange, remotePolicy, sponsorshipSignals, hiringLocations, etc.). Fields never consumed by AA or Outreach can be dropped or moved to a separate "company_extended" table if you still want them for analytics.',
  );
  fs.writeFileSync(summaryPath, lines.join('\n'), 'utf-8');
  console.log(`Wrote ${summaryPath}`);

  console.log('\n--- Summary (first 15 fields by least filled) ---');
  fieldStats.slice(0, 15).forEach((s) => {
    console.log(
      `  ${s.fieldSnake.padEnd(36)} filled=${String(s.filled).padStart(4)}  missing=${String(s.missing).padStart(4)}  ${s.pctFilled}%  AA=${s.usedByAA ? 'Y' : '-'}  Outreach=${s.usedByOutreach ? 'Y' : '-'}`,
    );
  });
  console.log(`\nTotal companies: ${total}. Full stats in ${jsonPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
