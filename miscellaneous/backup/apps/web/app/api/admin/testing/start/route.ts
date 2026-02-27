import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  getDb,
  listCompanies,
  upsertCompanyByNormalizedNameAndType,
  type InsertCompanyInput,
} from '@careersignal/db';
import { runCompanyScrape } from '@/lib/run-company-scrape';

function normalizeName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'unknown'
  );
}

function extractGreenhouseTokenFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname.replace(/\/+$/, '') || '/';

    if (host === 'boards.greenhouse.io' && pathname !== '/') {
      const parts = pathname.split('/').filter(Boolean);
      return parts[0] ?? null;
    }
    if (host.endsWith('.greenhouse.io')) {
      return host.slice(0, -'.greenhouse.io'.length) || null;
    }
    return null;
  } catch {
    return null;
  }
}

function extractGreenhouseTokensFromHtml(html: string): string[] {
  const tokens = new Set<string>();

  const boardRe = /boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = boardRe.exec(html)) !== null) {
    if (m[1]) tokens.add(m[1]);
  }

  const subdomainRe = /https?:\/\/([a-zA-Z0-9_-]+)\.greenhouse\.io/g;
  while ((m = subdomainRe.exec(html)) !== null) {
    if (m[1]) tokens.add(m[1]);
  }

  return Array.from(tokens);
}

function findCandidateInternalLinks(html: string, baseUrl: string): string[] {
  const hrefRe = /href="([^"]+)"/g;
  const urls = new Set<string>();
  let m: RegExpExecArray | null;
  const keywords = ['job', 'jobs', 'career', 'careers', 'opening', 'opportunities', 'position'];

  while ((m = hrefRe.exec(html)) !== null && urls.size < 5) {
    const raw = m[1] ?? '';
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) {
      continue;
    }
    const lower = raw.toLowerCase();
    if (!keywords.some((k) => lower.includes(k))) continue;
    try {
      const abs = new URL(raw, baseUrl).toString();
      urls.add(abs);
    } catch {
      // ignore bad URLs
    }
  }

  return Array.from(urls);
}

async function fetchWithLogs(
  url: string,
  logs: string[],
): Promise<{ finalUrl: string; html: string } | null> {
  logs.push(`  Fetching ${url} …`);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'CareerSignal-Greenhouse-Discovery/0.1',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const finalUrl = res.url || url;
    logs.push(`  HTTP ${res.status} (${res.statusText}) — final URL: ${finalUrl}`);
    if (!res.ok) return null;
    const html = await res.text();
    logs.push(`  Got HTML (${html.length} bytes).`);
    return { finalUrl, html };
  } catch (e) {
    logs.push(`  Fetch error for ${url}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

const GREENHOUSE_TOKEN_BLOCKLIST = new Set<string>([
  'boards',
  'job-boards',
  'api-geocode-earth-proxy',
  'my',
  'embed',
  'api',
]);

async function isLikelyValidGreenhouseToken(
  token: string,
  log: (msg: string) => void,
): Promise<boolean> {
  if (!token || GREENHOUSE_TOKEN_BLOCKLIST.has(token)) {
    log(`  Skipping token ${token} (blocklisted or empty).`);
    return false;
  }
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    token,
  )}/jobs?content=false`;
  log(`  Probing Greenhouse token via API: ${url}`);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    log(`  Probe result for token=${token}: HTTP ${res.status} (${res.statusText})`);
    if (!res.ok) return false;
    // A 200 with zero jobs is still fine; connector will handle content=true later.
    return true;
  } catch (e) {
    log(`  Probe error for token=${token}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

type ConnectorKind = 'GREENHOUSE' | 'LEVER' | 'ASHBY' | 'CRAWL';

export async function POST(req: Request) {
  const logs: string[] = [];
  const log = (msg: string) => {
    const line = `${new Date().toISOString()} ${msg}`;
    logs.push(line);
    console.log(`[testing/start] ${line}`);
  };

  try {
    log('Starting testing run…');
    let connector: ConnectorKind = 'GREENHOUSE';
    try {
      const body = await req.json();
      if (body && typeof body.connector === 'string') {
        if (body.connector === 'LEVER') connector = 'LEVER';
        else if (body.connector === 'ASHBY') connector = 'ASHBY';
        else if (body.connector === 'CRAWL') connector = 'CRAWL';
      }
    } catch {
      // no body / invalid JSON -> default connector
    }
    log(`Selected connector: ${connector}`);

    const user = await getSessionUser();
    if (!user || !user.admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    log('Auth OK.');

    const db = getDb();

    // CRAWL: run budgeted crawler for all RESOURCE + SOURCE rows that have a URL
    if (connector === 'CRAWL') {
      const [resourceRows, sourceRows] = await Promise.all([
        listCompanies(db, { type: 'RESOURCE' }),
        listCompanies(db, { type: 'SOURCE' }),
      ]);
      const crawlTargets = [...resourceRows, ...sourceRows].filter((c) => c.url?.trim()) as Array<{
        id: string;
        name: string;
        url: string;
      }>;
      log(
        `Found ${crawlTargets.length} RESOURCE/SOURCE companies with URLs. Running budgeted crawler for each.`,
      );
      const crawlResults: Array<{
        companyName: string;
        companyId: string;
        jobsFetched: number;
        jobsUpserted: number;
        errors: string[];
      }> = [];
      for (const company of crawlTargets) {
        log(`\n== Crawling: ${company.name} (${company.url}) ==`);
        try {
          const result = await runCompanyScrape(company.id);
          log(
            `  jobsFetched=${result.jobsFetched}, jobsUpserted=${result.jobsUpserted}, observationsCreated=${result.observationsCreated}`,
          );
          if (result.evidencePath) log(`  Evidence: ${result.evidencePath}`);
          if (result.errors.length > 0) {
            log(`  Errors:\n${result.errors.map((e) => `    - ${e}`).join('\n')}`);
          }
          crawlResults.push({
            companyName: company.name,
            companyId: company.id,
            jobsFetched: result.jobsFetched,
            jobsUpserted: result.jobsUpserted,
            errors: result.errors,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log(`  Failed: ${msg}`);
          crawlResults.push({
            companyName: company.name,
            companyId: company.id,
            jobsFetched: 0,
            jobsUpserted: 0,
            errors: [msg],
          });
        }
      }
      log('\nCrawl run finished.');
      return NextResponse.json({
        ok: true,
        logs,
        results: crawlResults,
      });
    }

    const allCompanies = await listCompanies(db, { type: 'COMPANY' });
    const rootCompanies = allCompanies.filter((c) => !c.connectorConfig);
    log(
      `Discovered ${allCompanies.length} COMPANY rows; probing ${rootCompanies.length} root companies (no connectorConfig).`,
    );

    const results: Array<{
      companyName: string;
      careersUrl: string;
      greenhouseTokens: string[];
      scrapedBoards: Array<{
        boardToken: string;
        companyId: string;
        jobsFetched: number;
        jobsUpserted: number;
        observationsCreated: number;
        errors: string[];
      }>;
    }> = [];

    // For now, we only support Greenhouse and Lever connectors. We reuse the same
    // discovery loop but adjust detection/probing per connector where needed.

    for (const company of rootCompanies) {
      const careersUrl = company.url;
      log(`\n== Probing company: ${company.name} ==`);
      log(`Careers URL: ${careersUrl}`);

      const companyResult = {
        companyName: company.name,
        careersUrl,
        greenhouseTokens: [] as string[],
        scrapedBoards: [] as Array<{
          boardToken: string;
          companyId: string;
          jobsFetched: number;
          jobsUpserted: number;
          observationsCreated: number;
          errors: string[];
        }>,
      };

      if (!careersUrl) {
        log('  No URL on company row; skipping.');
        results.push(companyResult);
        continue;
      }

      // Depth 1: careers URL
      const first = await fetchWithLogs(careersUrl, logs);
      const rawTokens = new Set<string>();
      if (first) {
        if (connector === 'GREENHOUSE') {
          const t1 = extractGreenhouseTokenFromUrl(first.finalUrl);
          if (t1) {
            logs.push(`  Detected Greenhouse from final URL: boardToken=${t1}`);
            rawTokens.add(t1);
          }
          const htmlTokens = extractGreenhouseTokensFromHtml(first.html);
          if (htmlTokens.length > 0) {
            logs.push(
              `  Found Greenhouse references in HTML: ${htmlTokens
                .map((t) => `boardToken=${t}`)
                .join(', ')}`,
            );
            htmlTokens.forEach((t) => rawTokens.add(t));
          }
        } else if (connector === 'LEVER') {
          // Lever detection: look for jobs.lever.co/{account} references.
          const leverRe = /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/g;
          let m: RegExpExecArray | null;
          while ((m = leverRe.exec(first.html)) !== null) {
            if (m[1]) {
              logs.push(`  Found Lever reference in HTML: account=${m[1]}`);
              rawTokens.add(m[1]);
            }
          }
        } else if (connector === 'ASHBY') {
          // Ashby detection: jobs.ashbyhq.com/{boardName} and *.ashbyhq.com
          // 1) From final URL host
          try {
            const u = new URL(first.finalUrl);
            const host = u.hostname.toLowerCase();
            const pathname = u.pathname.replace(/\/+$/, '') || '/';
            if (host === 'jobs.ashbyhq.com' && pathname !== '/') {
              const parts = pathname.split('/').filter(Boolean);
              const boardName = parts[0];
              if (boardName) {
                logs.push(`  Detected Ashby from final URL: boardName=${boardName}`);
                rawTokens.add(boardName);
              }
            } else if (host.endsWith('.ashbyhq.com')) {
              const boardName = host.slice(0, -'.ashbyhq.com'.length);
              if (boardName) {
                logs.push(`  Detected Ashby from subdomain: boardName=${boardName}`);
                rawTokens.add(boardName);
              }
            }
          } catch {
            // ignore URL parse errors
          }
          // 2) From HTML links
          const ashbyPathRe = /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/g;
          let mAsh: RegExpExecArray | null;
          while ((mAsh = ashbyPathRe.exec(first.html)) !== null) {
            if (mAsh[1]) {
              logs.push(`  Found Ashby reference in HTML: boardName=${mAsh[1]}`);
              rawTokens.add(mAsh[1]);
            }
          }
          const ashbySubdomainRe = /https?:\/\/([a-zA-Z0-9_-]+)\.ashbyhq\.com/g;
          while ((mAsh = ashbySubdomainRe.exec(first.html)) !== null) {
            if (mAsh[1]) {
              logs.push(`  Found Ashby subdomain in HTML: boardName=${mAsh[1]}`);
              rawTokens.add(mAsh[1]);
            }
          }
        }

        // Depth 2: follow a few internal jobs/careers links if still no token
        if (rawTokens.size === 0) {
          const candidates = findCandidateInternalLinks(first.html, first.finalUrl);
          if (candidates.length > 0) {
            logs.push(
              `  No ${connector} found yet. Following up to ${candidates.length} internal jobs/careers links…`,
            );
          }
          for (const link of candidates) {
            const second = await fetchWithLogs(link, logs);
            if (!second) continue;
            if (connector === 'GREENHOUSE') {
              const t2 = extractGreenhouseTokenFromUrl(second.finalUrl);
              if (t2) {
                logs.push(`  [depth=2] Detected Greenhouse from final URL: boardToken=${t2}`);
                rawTokens.add(t2);
              }
              const htmlTokens2 = extractGreenhouseTokensFromHtml(second.html);
              if (htmlTokens2.length > 0) {
                logs.push(
                  `  [depth=2] Found Greenhouse references in HTML: ${htmlTokens2
                    .map((t) => `boardToken=${t}`)
                    .join(', ')}`,
                );
                htmlTokens2.forEach((t) => rawTokens.add(t));
              }
            } else if (connector === 'LEVER') {
              const leverRe2 = /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/g;
              let m2: RegExpExecArray | null;
              while ((m2 = leverRe2.exec(second.html)) !== null) {
                if (m2[1]) {
                  logs.push(`  [depth=2] Found Lever reference in HTML: account=${m2[1]}`);
                  rawTokens.add(m2[1]);
                }
              }
            } else if (connector === 'ASHBY') {
              try {
                const u2 = new URL(second.finalUrl);
                const host2 = u2.hostname.toLowerCase();
                const pathname2 = u2.pathname.replace(/\/+$/, '') || '/';
                if (host2 === 'jobs.ashbyhq.com' && pathname2 !== '/') {
                  const parts2 = pathname2.split('/').filter(Boolean);
                  const boardName2 = parts2[0];
                  if (boardName2) {
                    logs.push(`  [depth=2] Detected Ashby from final URL: boardName=${boardName2}`);
                    rawTokens.add(boardName2);
                  }
                } else if (host2.endsWith('.ashbyhq.com')) {
                  const boardName2 = host2.slice(0, -'.ashbyhq.com'.length);
                  if (boardName2) {
                    logs.push(`  [depth=2] Detected Ashby from subdomain: boardName=${boardName2}`);
                    rawTokens.add(boardName2);
                  }
                }
              } catch {
                // ignore URL parse errors
              }
              const ashbyPathRe2 = /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/g;
              let mAsh2: RegExpExecArray | null;
              while ((mAsh2 = ashbyPathRe2.exec(second.html)) !== null) {
                if (mAsh2[1]) {
                  logs.push(`  [depth=2] Found Ashby reference in HTML: boardName=${mAsh2[1]}`);
                  rawTokens.add(mAsh2[1]);
                }
              }
              const ashbySubdomainRe2 = /https?:\/\/([a-zA-Z0-9_-]+)\.ashbyhq\.com/g;
              while ((mAsh2 = ashbySubdomainRe2.exec(second.html)) !== null) {
                if (mAsh2[1]) {
                  logs.push(`  [depth=2] Found Ashby subdomain in HTML: boardName=${mAsh2[1]}`);
                  rawTokens.add(mAsh2[1]);
                }
              }
            }
          }
        }
      }

      const candidateTokens = Array.from(rawTokens);
      if (candidateTokens.length === 0) {
        log(`  No ${connector} tokens detected for this company.`);
        results.push(companyResult);
        continue;
      }

      const validTokens: string[] = [];
      for (const token of candidateTokens) {
        if (connector === 'GREENHOUSE') {
          const ok = await isLikelyValidGreenhouseToken(token, log);
          if (!ok) {
            log(`  Token ${token} rejected (invalid or unreachable).`);
            continue;
          }
          validTokens.push(token);
        } else if (connector === 'LEVER') {
          // Lever probe: reuse postings API with ?mode=json
          const url = `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
          log(`  Probing Lever account via API: ${url}`);
          try {
            const res = await fetch(url, {
              method: 'GET',
              headers: { Accept: 'application/json' },
            });
            log(
              `  Probe result for Lever account=${token}: HTTP ${res.status} (${res.statusText})`,
            );
            if (!res.ok) {
              log(`  Token ${token} rejected (invalid or unreachable).`);
              continue;
            }
            validTokens.push(token);
          } catch (e) {
            log(
              `  Probe error for Lever account=${token}: ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
          }
        }
      }

      if (validTokens.length === 0) {
        log('  No valid Greenhouse tokens after probing; skipping scrapes for this company.');
        results.push(companyResult);
        continue;
      }

      companyResult.greenhouseTokens = validTokens;

      for (const token of validTokens) {
        if (connector === 'GREENHOUSE') {
          logs.push(`  Preparing Greenhouse scrape for boardToken=${token} …`);
          const ghName = `${company.name} (Greenhouse)`;
          const normalizedName = normalizeName(`${company.name}-${token}`);

          const input: InsertCompanyInput = {
            type: 'COMPANY',
            name: ghName,
            normalizedName,
            url: `https://boards.greenhouse.io/${token}`,
            origin: company.origin ?? 'CSV_DISCOVERY',
            kind: company.kind ?? 'company_careers',
            isPriorityTarget: Boolean(company.isPriorityTarget),
            enabledForScraping: true,
            atsType: 'GREENHOUSE',
            scrapeStrategy: 'API_JSON',
            connectorConfig: { boardToken: token },
            websiteDomain: 'boards.greenhouse.io',
          };

          logs.push(`  Ensuring company row exists for ${ghName} (boardToken=${token}) …`);
          const { id: companyId, created } = await upsertCompanyByNormalizedNameAndType(db, input);
          logs.push(
            created
              ? `  Created company ${ghName} (id=${companyId}).`
              : `  Found existing company ${ghName} (id=${companyId}), updating config.`,
          );

          logs.push(`  Running runCompanyScrape for Greenhouse company id=${companyId} …`);
          const result = await runCompanyScrape(companyId);
          logs.push(
            `  Scrape finished: jobsFetched=${result.jobsFetched}, jobsUpserted=${result.jobsUpserted}, observationsCreated=${result.observationsCreated}.`,
          );
          if (result.evidencePath) {
            logs.push(`  Evidence written to: ${result.evidencePath}`);
          }
          if (result.errors.length > 0) {
            logs.push(`  Errors:\n${result.errors.map((e) => `    - ${e}`).join('\n')}`);
          } else {
            logs.push('  No errors from connector or persistence layer.');
          }

          companyResult.scrapedBoards.push({
            boardToken: token,
            companyId,
            jobsFetched: result.jobsFetched,
            jobsUpserted: result.jobsUpserted,
            observationsCreated: result.observationsCreated,
            errors: result.errors,
          });
        } else if (connector === 'LEVER') {
          logs.push(`  Preparing Lever scrape for account=${token} …`);
          const leverName = `${company.name} (Lever)`;
          const normalizedName = normalizeName(`${company.name}-lever-${token}`);

          const input: InsertCompanyInput = {
            type: 'COMPANY',
            name: leverName,
            normalizedName,
            url: `https://jobs.lever.co/${token}`,
            origin: company.origin ?? 'CSV_DISCOVERY',
            kind: company.kind ?? 'company_careers',
            isPriorityTarget: Boolean(company.isPriorityTarget),
            enabledForScraping: true,
            atsType: 'LEVER',
            scrapeStrategy: 'API_JSON',
            connectorConfig: { companySlug: token },
            websiteDomain: 'jobs.lever.co',
          };

          logs.push(`  Ensuring company row exists for ${leverName} (account=${token}) …`);
          const { id: companyId, created } = await upsertCompanyByNormalizedNameAndType(db, input);
          logs.push(
            created
              ? `  Created company ${leverName} (id=${companyId}).`
              : `  Found existing company ${leverName} (id=${companyId}), updating config.`,
          );

          logs.push(`  Running runCompanyScrape for Lever company id=${companyId} …`);
          const result = await runCompanyScrape(companyId);
          logs.push(
            `  Scrape finished: jobsFetched=${result.jobsFetched}, jobsUpserted=${result.jobsUpserted}, observationsCreated=${result.observationsCreated}.`,
          );
          if (result.evidencePath) {
            logs.push(`  Evidence written to: ${result.evidencePath}`);
          }
          if (result.errors.length > 0) {
            logs.push(`  Errors:\n${result.errors.map((e) => `    - ${e}`).join('\n')}`);
          } else {
            logs.push('  No errors from connector or persistence layer.');
          }

          companyResult.scrapedBoards.push({
            boardToken: token,
            companyId,
            jobsFetched: result.jobsFetched,
            jobsUpserted: result.jobsUpserted,
            observationsCreated: result.observationsCreated,
            errors: result.errors,
          });
        } else if (connector === 'ASHBY') {
          logs.push(`  Preparing Ashby scrape for boardName=${token} …`);
          const ashbyName = `${company.name} (Ashby)`;
          const normalizedName = normalizeName(`${company.name}-ashby-${token}`);

          const input: InsertCompanyInput = {
            type: 'COMPANY',
            name: ashbyName,
            normalizedName,
            url: `https://jobs.ashbyhq.com/${token}`,
            origin: company.origin ?? 'CSV_DISCOVERY',
            kind: company.kind ?? 'company_careers',
            isPriorityTarget: Boolean(company.isPriorityTarget),
            enabledForScraping: true,
            atsType: 'ASHBY',
            scrapeStrategy: 'API_JSON',
            connectorConfig: { boardName: token },
            websiteDomain: 'jobs.ashbyhq.com',
          };

          logs.push(`  Ensuring company row exists for ${ashbyName} (boardName=${token}) …`);
          const { id: companyId, created } = await upsertCompanyByNormalizedNameAndType(db, input);
          logs.push(
            created
              ? `  Created company ${ashbyName} (id=${companyId}).`
              : `  Found existing company ${ashbyName} (id=${companyId}), updating config.`,
          );

          logs.push(`  Running runCompanyScrape for Ashby company id=${companyId} …`);
          const result = await runCompanyScrape(companyId);
          logs.push(
            `  Scrape finished: jobsFetched=${result.jobsFetched}, jobsUpserted=${result.jobsUpserted}, observationsCreated=${result.observationsCreated}.`,
          );
          if (result.evidencePath) {
            logs.push(`  Evidence written to: ${result.evidencePath}`);
          }
          if (result.errors.length > 0) {
            logs.push(`  Errors:\n${result.errors.map((e) => `    - ${e}`).join('\n')}`);
          } else {
            logs.push('  No errors from connector or persistence layer.');
          }

          companyResult.scrapedBoards.push({
            boardToken: token,
            companyId,
            jobsFetched: result.jobsFetched,
            jobsUpserted: result.jobsUpserted,
            observationsCreated: result.observationsCreated,
            errors: result.errors,
          });
        }
      }

      results.push(companyResult);
    }

    log('Testing run finished.');
    return NextResponse.json({
      ok: true,
      logs,
      results,
    });
  } catch (e) {
    console.error('[testing/start]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Testing run failed' },
      { status: 500 },
    );
  }
}
