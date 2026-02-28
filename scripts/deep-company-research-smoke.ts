/**
 * Deep Company Research Smoke Test
 *
 * Uses a handful of companies from the CareerSignal_Master_Sources.csv file
 * and runs the Deep Company Research Agent against them, then upserts results
 * into the companies table. Prints a compact summary for each.
 *
 * Run (from repo root): npx ts-node scripts/deep-company-research-smoke.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDb, upsertCompanyEnrichment } from '@careersignal/db';
import { deepResearchCompany } from '@careersignal/agents';

const CSV_PATH = path.resolve(
  process.cwd(),
  'miscellaneous/sources/CareerSignal_Master_Sources.csv',
);

interface CsvRow {
  name: string;
  url: string;
  kind: string;
  origin: string;
}

function parseCsvSample(content: string, limit = 5): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length && rows.length < limit; i++) {
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
    console.error('CSV not found for deep company smoke test:', CSV_PATH);
    process.exit(1);
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const sampleRows = parseCsvSample(content, 5);

  if (!sampleRows.length) {
    console.error('No rows parsed from CSV for smoke test.');
    process.exit(1);
  }

  console.log(`Deep company research smoke test for ${sampleRows.length} companies...`);
  const db = getDb();

  for (const row of sampleRows) {
    console.log('\n---');
    console.log(`Company: ${row.name}`);
    console.log(`Seed URL: ${row.url}`);

    const deepResult = await deepResearchCompany({
      companyName: row.name,
      seedUrl: row.url,
      jobDescriptionText: undefined,
      log: ({ level, message }) => {
        const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
        console.log(`${prefix} ${message}`);
      },
      hardTimeoutMs: 90_000,
    });

    const upserted = await upsertCompanyEnrichment(db, {
      name: deepResult.companyName,
      normalizedName: deepResult.normalizedName,
      url: deepResult.primaryUrl ?? row.url,
      origin: row.origin || null,
      websiteDomain: deepResult.websiteDomain,
      descriptionText: deepResult.descriptionText,
      enrichmentSources: { urls: deepResult.visitedUrls },
      industries: deepResult.industries,
      hqLocation: deepResult.hqLocation,
      sizeRange: deepResult.sizeRange,
      foundedYear: deepResult.foundedYear ?? null,
      fundingStage: deepResult.fundingStage,
      publicCompany: deepResult.publicCompany ?? null,
      ticker: deepResult.ticker,
      remotePolicy: deepResult.remotePolicy,
      sponsorshipSignals: {
        ...(deepResult.sponsorshipSignals ?? {}),
        coreCoverage: deepResult.coreFieldCoverage,
        missingCoreFields: deepResult.missingCoreFields,
      },
      hiringLocations: deepResult.hiringLocations,
      techStackHints: deepResult.techStackHints,
      jobCountTotal: deepResult.jobCountTotal ?? undefined,
      jobCountOpen: deepResult.jobCountOpen ?? undefined,
      enrichmentStatus: deepResult.coreFieldCoverage >= 0.5 ? 'DONE' : 'ERROR',
    });

    console.log(
      `Upserted company id=${upserted.id}, coverage=${(deepResult.coreFieldCoverage * 100).toFixed(
        0,
      )}%`,
    );
    console.log(
      `  hqLocation=${upserted.hqLocation ?? 'n/a'}, sizeRange=${
        upserted.sizeRange ?? 'n/a'
      }, fundingStage=${upserted.fundingStage ?? 'n/a'}`,
    );
    console.log(
      `  remotePolicy=${upserted.remotePolicy ?? 'n/a'}, jobCountOpen=${
        upserted.jobCountOpen ?? 'n/a'
      }`,
    );
  }

  console.log('\nDeep company research smoke test complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
