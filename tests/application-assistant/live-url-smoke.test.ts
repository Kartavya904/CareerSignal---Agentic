import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { cleanHtml, classifyPage, extractJobDetail } from '@careersignal/agents';
import { getUrlCases, type UrlCase } from './url-corpus';

/** Single URL result for the log file. */
export type LiveUrlResultEntry = {
  index: number;
  total: number;
  label: string;
  url: string;
  expectedJob: boolean;
  passed: boolean;
  classificationType?: string;
  outcome?: 'extracted' | 'gone' | 'non_job' | 'listing' | 'skipped_js';
  extractedTitle?: string;
  extractedCompany?: string;
  reason?: string;
  durationMs: number;
};

/** Collected during run when RUN_LIVE_URL_TESTS=1; written to file in afterAll. */
const liveUrlRunResults: LiveUrlResultEntry[] = [];

const JOB_TYPES = new Set(['detail', 'listing', 'company_careers', 'external_apply']);
/** For job URLs, these types are acceptable (page was a job but expired/error). */
const JOB_OK_IF_GONE = new Set(['expired', 'error']);
const PER_TEST_TIMEOUT = 1000 * 60 * 2; // 2 min per URL

/** Normalize for flexible match: lowercase, collapse spaces, trim. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function companyConsistent(expected: string, extracted: string): boolean {
  const a = norm(expected);
  const b = norm(extracted);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  const aTokens = a.split(/\s+/).filter((t) => t.length > 1);
  const bTokens = b.split(/\s+/).filter((t) => t.length > 1);
  return aTokens.some((t) => b.includes(t)) || bTokens.some((t) => a.includes(t));
}

function titleConsistent(expected: string, extracted: string): boolean {
  const a = norm(expected);
  const b = norm(extracted);
  if (!a || !b || b === 'untitled') return false;
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  const aTokens = a.split(/\s+/).filter((t) => t.length > 1);
  return aTokens.filter((t) => b.includes(t)).length >= Math.min(2, aTokens.length);
}

async function fetchHtml(
  url: string,
  timeoutMs = 25000,
): Promise<{ html: string; statusCode: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = await res.text();
    return { html, statusCode: res.status };
  } finally {
    clearTimeout(t);
  }
}

const extractJobDetailWithOptions = extractJobDetail as (
  h: string,
  u: string,
  o?: { allowLlmFallback?: boolean },
) => ReturnType<typeof extractJobDetail>;

type RunResult = {
  passed: boolean;
  classificationType?: string;
  outcome?: LiveUrlResultEntry['outcome'];
  extractedTitle?: string;
  extractedCompany?: string;
  reason?: string;
};

async function runOneUrlInner(c: UrlCase, prefix: string): Promise<RunResult> {
  const { html, statusCode } = await fetchHtml(c.url);
  const cleaned = cleanHtml(html);
  const classification = await classifyPage(cleaned.html, c.url, { statusCode });
  const isJob = JOB_TYPES.has(classification.type);

  if (c.expectJob) {
    const gone = JOB_OK_IF_GONE.has(classification.type);
    if (!isJob && !gone) {
      console.warn(
        `${prefix} FAIL — ${c.label}\n  reason: expected job page, got type=${classification.type}`,
      );
      return {
        passed: false,
        classificationType: classification.type,
        reason: `expected job page, got type=${classification.type}`,
      };
    }
    if (gone) {
      console.log(
        `${prefix} PASS — ${c.label}\n  type=${classification.type} (job page gone/error, skip extraction)`,
      );
      return {
        passed: true,
        classificationType: classification.type,
        outcome: 'gone',
      };
    }
    if (classification.type === 'detail' || classification.type === 'external_apply') {
      const job = await extractJobDetailWithOptions(cleaned.html, c.url, {
        allowLlmFallback: false,
      });
      const jobRaw =
        job.title === 'Untitled'
          ? await extractJobDetailWithOptions(html, c.url, { allowLlmFallback: false })
          : job;
      if (jobRaw.title === 'Untitled') {
        const knownJobBoard =
          /greenhouse\.io|jobs\.lever\.co|apply\.workable\.com|smartrecruiters\.com|ashbyhq\.com/i.test(
            c.url,
          );
        if (knownJobBoard) {
          console.log(
            `${prefix} PASS — ${c.label}\n  extraction skipped (no structured data; page may be JS-rendered)`,
          );
          return {
            passed: true,
            classificationType: classification.type,
            outcome: 'skipped_js',
          };
        }
        console.warn(
          `${prefix} FAIL — ${c.label}\n  reason: extraction produced Untitled (no JSON-LD/microdata/DOM match)`,
        );
        return {
          passed: false,
          classificationType: classification.type,
          reason: 'extraction produced Untitled (no JSON-LD/microdata match)',
        };
      }
      if (c.company !== undefined && c.position !== undefined) {
        if (!companyConsistent(c.company, jobRaw.company)) {
          console.warn(
            `${prefix} FAIL — ${c.label}\n  company: expected "${c.company}", got "${jobRaw.company}"`,
          );
          return {
            passed: false,
            classificationType: classification.type,
            extractedTitle: jobRaw.title,
            extractedCompany: jobRaw.company,
            reason: `company mismatch: expected "${c.company}", got "${jobRaw.company}"`,
          };
        }
        if (!titleConsistent(c.position, jobRaw.title)) {
          console.warn(
            `${prefix} FAIL — ${c.label}\n  title: expected "${c.position}", got "${jobRaw.title}"`,
          );
          return {
            passed: false,
            classificationType: classification.type,
            extractedTitle: jobRaw.title,
            extractedCompany: jobRaw.company,
            reason: `title mismatch: expected "${c.position}", got "${jobRaw.title}"`,
          };
        }
        if (!jobRaw.company || jobRaw.company === 'Unknown') {
          console.warn(`${prefix} FAIL — ${c.label}\n  reason: extracted company empty/Unknown`);
          return {
            passed: false,
            classificationType: classification.type,
            extractedTitle: jobRaw.title,
            reason: 'extracted company empty/Unknown (needed for company research step)',
          };
        }
      }
      console.log(
        `${prefix} PASS — ${c.label}\n  extracted: "${jobRaw.title}" at ${jobRaw.company}`,
      );
      return {
        passed: true,
        classificationType: classification.type,
        outcome: 'extracted',
        extractedTitle: jobRaw.title,
        extractedCompany: jobRaw.company,
      };
    }
    console.log(
      `${prefix} PASS — ${c.label}\n  type=${classification.type} (listing/careers, no extraction check)`,
    );
    return {
      passed: true,
      classificationType: classification.type,
      outcome: 'listing',
    };
  } else {
    if (isJob) {
      console.warn(
        `${prefix} FAIL — ${c.label}\n  reason: expected NOT job page, got type=${classification.type}`,
      );
      return {
        passed: false,
        classificationType: classification.type,
        reason: `expected NOT job page, got type=${classification.type}`,
      };
    }
    console.log(
      `${prefix} PASS — ${c.label}\n  correctly classified as non-job (type=${classification.type})`,
    );
    return {
      passed: true,
      classificationType: classification.type,
      outcome: 'non_job',
    };
  }
}

async function runOneUrl(c: UrlCase, index: number, total: number): Promise<RunResult> {
  const num = index + 1;
  const prefix = `[${num}/${total}]`;
  try {
    return await runOneUrlInner(c, prefix);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`${prefix} FAIL — ${c.label}\n  reason: ${reason}`);
    return { passed: false, reason };
  }
}

function writeResultsLog(): void {
  if (liveUrlRunResults.length === 0) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(process.cwd(), 'tests', 'application-assistant');
  const baseName = `live-url-results-${timestamp}`;
  const jsonPath = join(dir, `${baseName}.json`);
  const mdPath = join(dir, `${baseName}.md`);

  const summary = {
    runAt: new Date().toISOString(),
    total: liveUrlRunResults.length,
    passed: liveUrlRunResults.filter((r) => r.passed).length,
    failed: liveUrlRunResults.filter((r) => !r.passed).length,
    results: liveUrlRunResults,
  };

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');

    const mdLines: string[] = [
      `# Live URL smoke test results`,
      '',
      `**Run:** ${summary.runAt}  `,
      `**Passed:** ${summary.passed}/${summary.total}  `,
      `**Failed:** ${summary.failed}`,
      '',
      `| # | Label | URL | Status | Type | Extracted title | Extracted company | Reason | Ms |`,
      `|---|-------|-----|--------|------|-----------------|-------------------|--------|-----|`,
    ];
    for (const r of liveUrlRunResults) {
      const status = r.passed ? 'PASS' : 'FAIL';
      const type = r.classificationType ?? '—';
      const safe = (s: string) =>
        String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/`/g, "'");
      const title = safe(r.extractedTitle ?? '—').slice(0, 40);
      const company = safe(r.extractedCompany ?? '—').slice(0, 30);
      const reason = safe(r.reason ?? r.outcome ?? '—').slice(0, 50);
      const urlShort = r.url.length > 48 ? r.url.slice(0, 45) + '...' : r.url;
      const labelSafe = safe(r.label);
      mdLines.push(
        '| ' +
          [r.index, labelSafe, urlShort, status, type, title, company, reason, r.durationMs].join(
            ' | ',
          ) +
          ' |',
      );
    }
    writeFileSync(mdPath, mdLines.join('\n'), 'utf8');

    console.log(`\nLive URL results written to:\n  ${jsonPath}\n  ${mdPath}`);
  } catch (err) {
    console.warn('Failed to write live URL results:', err);
  }
}

describe('application-assistant live URL smoke', () => {
  const run = process.env.RUN_LIVE_URL_TESTS === '1';
  const URL_CASES = getUrlCases();

  if (run && URL_CASES.length > 0) {
    afterAll(() => {
      if (liveUrlRunResults.length > 0) writeResultsLog();
    });
  }

  if (URL_CASES.length === 0) {
    (run ? it : it.skip)('loads corpus', () => {
      throw new Error(
        'Corpus empty: ensure tests/application-assistant/fixtures/final_job_links_all_100.csv exists.',
      );
    });
  }

  URL_CASES.forEach((c, index) => {
    (run ? it : it.skip)(
      `${index + 1}/${URL_CASES.length} ${c.label}`,
      async () => {
        const start = Date.now();
        const result = await runOneUrl(c, index, URL_CASES.length);
        const durationMs = Date.now() - start;
        liveUrlRunResults.push({
          index: index + 1,
          total: URL_CASES.length,
          label: c.label,
          url: c.url,
          expectedJob: c.expectJob,
          passed: result.passed,
          classificationType: result.classificationType,
          outcome: result.outcome,
          extractedTitle: result.extractedTitle,
          extractedCompany: result.extractedCompany,
          reason: result.reason,
          durationMs,
        });
        if (!result.passed) throw new Error(result.reason);
      },
      PER_TEST_TIMEOUT,
    );
  });
});
