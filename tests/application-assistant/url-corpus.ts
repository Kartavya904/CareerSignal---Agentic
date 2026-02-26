import { readFileSync } from 'fs';
import { join } from 'path';

export type UrlCase = {
  url: string;
  expectJob: boolean;
  label: string;
  company?: string;
  position?: string;
};

/**
 * Parse a single CSV line respecting quoted fields (e.g. "Full Circle Recruiting, LLC", "Engineer, Site/Civil").
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      const parts: string[] = [];
      while (end < line.length) {
        if (line[end] === '"') {
          if (line[end + 1] === '"') {
            parts.push('"');
            end += 2;
          } else {
            end += 1;
            break;
          }
        } else {
          parts.push(line[end]);
          end += 1;
        }
      }
      fields.push(parts.join(''));
      i = end;
      if (line[i] === ',') i += 1;
      continue;
    }
    const comma = line.indexOf(',', i);
    if (comma === -1) {
      fields.push(line.slice(i).trim());
      break;
    }
    fields.push(line.slice(i, comma).trim());
    i = comma + 1;
  }
  return fields;
}

/**
 * Load URL corpus from CSV content.
 * Expected columns: company, position, url (header row).
 * expectJob is false when position === 'N/A' (non-job URLs like Google, YouTube).
 */
export function loadCorpusFromCsv(csvContent: string): UrlCase[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const companyIdx = header.indexOf('company');
  const positionIdx = header.indexOf('position');
  const urlIdx = header.indexOf('url');
  if ([companyIdx, positionIdx, urlIdx].some((i) => i < 0)) return [];

  const cases: UrlCase[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const company = (cols[companyIdx] ?? '').trim();
    const position = (cols[positionIdx] ?? '').trim();
    const url = (cols[urlIdx] ?? '').trim();
    if (!url || !url.startsWith('http')) continue;
    const expectJob = position !== 'N/A';
    cases.push({
      company,
      position,
      url,
      expectJob,
      label: expectJob ? `${company} — ${position}` : `${company} (non-job)`,
    });
  }
  return cases;
}

const FIXTURE_NAME = 'final_job_links_all_100.csv';
const FIXTURE_PATH = join(__dirname, 'fixtures', FIXTURE_NAME);
const FIXTURE_PATH_FROM_CWD = join(
  process.cwd(),
  'tests',
  'application-assistant',
  'fixtures',
  FIXTURE_NAME,
);

/**
 * Default corpus: 100 URLs from final_job_links_all_100.csv (columns A/B for company/position confirmation).
 * Used for: classification, job/company extraction, and validating company/title against the CSV.
 */
export function getUrlCases(): UrlCase[] {
  for (const p of [FIXTURE_PATH, FIXTURE_PATH_FROM_CWD]) {
    try {
      const csv = readFileSync(p, 'utf8');
      return loadCorpusFromCsv(csv);
    } catch {
      continue;
    }
  }
  return [];
}

/** For backwards compatibility and test title: export a lazy-loaded list. */
export const URL_CASES: UrlCase[] = getUrlCases();
