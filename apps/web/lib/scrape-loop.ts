/**
 * Continuous scrape loop with Planner → Brain architecture.
 *
 * Flow per URL visit:
 *   1. Navigate and capture raw HTML
 *   2. Clean HTML immediately (HTML Cleanup Agent)
 *   3. Extract jobs from CLEANED HTML
 *   4. Classify page from cleaned HTML
 *   5. Discover ALL links from cleaned HTML → add to frontier
 *   6. Brain validates outcome and sets adaptation
 *   7. Planner decides next action
 *
 * The crawler explores aggressively: every link discovered on every page
 * is added to the frontier (filtered for same-domain, non-static).
 */

import { agentLog, getRecentLogsSnippet } from '@/lib/agent-logs';
import { clearAgentLogs } from '@/lib/agent-logs';
import { clearBrainLogs } from '@/lib/brain-logs';
import { runBrainAnalysis, brainOrchestrate, type BrainDecision } from '@/lib/brain-agent';
import { getScraperStatus, setScraperActive, setStopRequested } from '@/lib/scraper-state';
import {
  createPlannerState,
  planNextAction,
  generatePaginationSeeds,
  type BrainAdaptation,
} from '@/lib/scrape-planner';
import {
  saveSourceCapture,
  saveCleanedCapture,
  updateCaptureType,
  getCaptureContextSummary,
  readBestCaptureHtml,
  listCaptures,
  readCleanedCaptureHtml,
} from '@/lib/source-data';
import {
  clearAdminLogs,
  getDb,
  listBlessedSources,
  setScrapeRunning,
  upsertJobListingCache,
  setBlessedSourceScraped,
  updateBlessedSourceUrl,
  getVisitedUrlsForSource,
  markUrlVisited,
} from '@careersignal/db';
import {
  extractJobsFromHtml,
  normalizeJobForCache,
  validateSource,
  cleanHtml,
  classifyPage,
  filterLinks,
  extractLinksFromHtml,
  normalizeUrl,
  resolveUrl,
} from '@careersignal/agents';
import { chromium, type Browser, type Page } from 'playwright';
import { registerCaptchaSolve } from '@/lib/captcha-state';
import { registerLoginWait } from '@/lib/login-wall-state';

const DEFAULT_CYCLE_DELAY_MS = 10 * 1000;

/** Throw this from visitAndProcess or wait flows when stop is requested so the loop exits quickly. */
const STOP_REQUESTED_MSG = 'STOP_REQUESTED';

function isStopRequested(): boolean {
  return getScraperStatus().stopRequested;
}

/** Promise that rejects when stop is requested (poll every 800ms). Use in Promise.race() to abort long waits. */
function createStopRacePromise(): Promise<never> {
  return new Promise((_, rej) => {
    const id = setInterval(() => {
      if (getScraperStatus().stopRequested) {
        clearInterval(id);
        rej(new Error(STOP_REQUESTED_MSG));
      }
    }, 800);
  });
}

/** Sleep in chunks so we can abort when stop is requested. */
async function sleepWithStopCheck(ms: number): Promise<void> {
  const chunk = 1500;
  let remaining = ms;
  while (remaining > 0 && !isStopRequested()) {
    await new Promise((r) => setTimeout(r, Math.min(chunk, remaining)));
    remaining -= chunk;
  }
  if (isStopRequested()) throw new Error(STOP_REQUESTED_MSG);
}

/** Once a single source reaches this many jobs extracted, we stop that source and move on. */
const MAX_JOBS_PER_SOURCE = 5000;

/** Max number of sources to scrape in parallel when multiple are enabled. */
const MAX_PARALLEL_SOURCES = 3;

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-infobars',
  '--window-position=0,0',
  '--ignore-certificate-errors',
];

function jitter(baseMs: number, rangeMs = 1000): number {
  return baseMs + Math.floor(Math.random() * rangeMs);
}

/** Random ms in [minMs, maxMs] for human-like timing (avoids fixed bot patterns). */
function randomWaitMs(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

/** Content wait: 3.5–7s (random each time). */
function getContentWaitMs(): number {
  return randomWaitMs(3500, 7000);
}

/** SPA hydration extra for Wellfound etc.: 5–12s (random each time). */
function getSpaHydrationMs(): number {
  return randomWaitMs(5000, 12000);
}

async function waitForContent(
  page: { waitForSelector: (sel: string, opts?: { timeout?: number }) => Promise<unknown> },
  slug: string | null,
  waitMs: number,
): Promise<void> {
  const s = (slug ?? '').toLowerCase();
  if (s === 'wellfound') {
    try {
      await Promise.race([
        page.waitForSelector('#__NEXT_DATA__', { timeout: 15000 }),
        page.waitForSelector('a[href*="/company/"][href*="/jobs"]', { timeout: 15000 }),
      ]);
      agentLog('Navigator', 'Detected job content (Next.js or links)', { level: 'info' });
    } catch {
      agentLog('Navigator', 'Selector wait timed out; using fixed wait', { level: 'warn' });
    }
    const extra = getSpaHydrationMs();
    agentLog('Navigator', `Additional ${(extra / 1000).toFixed(1)}s for SPA hydration…`, {
      level: 'info',
    });
    await new Promise((r) => setTimeout(r, extra));
  }
  await new Promise((r) => setTimeout(r, waitMs));
}

function getSourceDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Repopulate frontier from existing captures (cleaned HTML) or re-seed with start URL. Never leaves frontier empty so crawl can continue. */
async function repopulateFrontierFromCaptures(
  state: ReturnType<typeof createPlannerState>,
  sourceSlug: string,
  source: { url: string },
  sourceDomain: string,
): Promise<number> {
  const captures = await listCaptures(sourceSlug);
  const allCandidateUrls: string[] = [];

  for (const entry of captures) {
    if (!entry.filenameCleaned) continue;
    const html = await readCleanedCaptureHtml(sourceSlug, entry.id);
    if (!html) continue;
    const links = extractLinksFromHtml(html, entry.url);
    allCandidateUrls.push(...links);
  }

  const uniqueCandidates = [...new Set(allCandidateUrls)];
  const filtered = filterLinks(uniqueCandidates, {
    sourceDomain,
    urlSeen: state.urlSeen,
    frontier: state.frontier,
    currentDepth: 0,
    maxDepth: state.maxDepth,
  });

  if (filtered.length > 0) {
    state.frontier.push(...filtered);
    agentLog(
      'Scraper',
      `Repopulated frontier from ${captures.length} capture(s): ${filtered.length} new URLs (frontier now: ${state.frontier.length})`,
      { level: 'success' },
    );
    return filtered.length;
  }

  const startUrlNormalized = normalizeUrl(source.url);
  if (
    !state.urlSeen.has(startUrlNormalized) &&
    !state.frontier.some((f) => normalizeUrl(f.url) === startUrlNormalized)
  ) {
    state.frontier.push({ url: source.url, depth: 0, priority: 90 });
    agentLog('Scraper', 'Frontier empty and no new URLs from captures; re-seeded with start URL.', {
      level: 'info',
    });
    return 1;
  }

  state.urlSeen.delete(startUrlNormalized);
  state.frontier.push({ url: source.url, depth: 0, priority: 90 });
  agentLog(
    'Scraper',
    'Frontier empty; no new URLs from captures. Re-visiting start URL and continuing.',
    { level: 'info' },
  );
  return 1;
}

// ── Full visit pipeline: navigate → clean → extract → classify → discover links ──

interface VisitResult {
  captureId: string;
  rawHtml: string;
  cleanedHtml: string;
  jobsExtracted: number;
  extractionStrategy: string;
  pageType: string;
  linksDiscovered: number;
}

async function visitAndProcess(
  page: Page,
  url: string,
  depth: number,
  sourceSlug: string,
  sourceSlugRaw: string | null,
  sourceId: string,
  sourceDomain: string,
  state: ReturnType<typeof createPlannerState>,
  db: ReturnType<typeof getDb>,
): Promise<VisitResult> {
  if (isStopRequested()) throw new Error(STOP_REQUESTED_MSG);

  // 1. Navigate
  await new Promise((r) => setTimeout(r, jitter(500, 500)));
  if (isStopRequested()) throw new Error(STOP_REQUESTED_MSG);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  if (isStopRequested()) throw new Error(STOP_REQUESTED_MSG);
  const contentWaitMs = getContentWaitMs();
  agentLog('Navigator', `Waiting for content (${(contentWaitMs / 1000).toFixed(1)}s)…`, {
    level: 'info',
  });
  await waitForContent(page, sourceSlugRaw, contentWaitMs);
  if (isStopRequested()) throw new Error(STOP_REQUESTED_MSG);
  const rawHtml = await page.content();
  agentLog('Navigator', `Captured raw HTML (${rawHtml.length} chars)`, { level: 'info' });

  // 2. Clean HTML immediately
  brainOrchestrate(`Cleaning HTML → HTML Cleanup Agent`, { phase: 'Cleanup' });
  const cleanResult = cleanHtml(rawHtml, url);
  const cleanedHtml = cleanResult.html;
  agentLog(
    'HTML Cleanup',
    `Cleaned: ${cleanResult.originalSize} → ${cleanResult.cleanedSize} chars (${cleanResult.elementsRemoved} elements removed, ${Math.round((1 - cleanResult.cleanedSize / cleanResult.originalSize) * 100)}% reduction)`,
    { level: 'success' },
  );

  if (isStopRequested()) throw new Error(STOP_REQUESTED_MSG);

  // 3. Save raw capture
  const capture = await saveSourceCapture(sourceSlug, url, rawHtml, {
    jobsExtracted: 0,
    strategy: 'pending',
    depth,
    normalizedUrl: normalizeUrl(url),
  });

  // 4. Save cleaned capture
  await saveCleanedCapture(sourceSlug, capture.id, cleanedHtml);
  agentLog('Navigator', `Saved raw + cleaned capture ${capture.id}`, { level: 'info' });
  if (isStopRequested()) throw new Error(STOP_REQUESTED_MSG);

  // 5. Extract jobs from CLEANED HTML
  brainOrchestrate(`Extracting jobs from cleaned HTML → DOM Extractor`, { phase: 'Extract' });
  let result = await extractJobsFromHtml(cleanedHtml, url, {
    slug: sourceSlugRaw ?? undefined,
  });
  agentLog(
    'DOM Extractor',
    `Found ${result.listings.length} listings (strategy: ${result.strategy})`,
    { level: result.listings.length > 0 ? 'success' : 'warn' },
  );

  // If 0 jobs from cleaned, also try raw (some extractors need raw structure like __NEXT_DATA__)
  if (result.listings.length === 0) {
    const rawResult = await extractJobsFromHtml(rawHtml, url, {
      slug: sourceSlugRaw ?? undefined,
    });
    if (rawResult.listings.length > result.listings.length) {
      agentLog(
        'DOM Extractor',
        `Raw HTML extraction found ${rawResult.listings.length} listings (cleaned had 0)`,
        { level: 'info' },
      );
      result = rawResult;
    }
  }

  // If still 0 from large HTML, try re-extracting from prior successful capture
  if (result.listings.length === 0 && rawHtml.length > 50000) {
    const prior = await readBestCaptureHtml(sourceSlug);
    if (prior && prior.entry.jobsExtracted > 0) {
      agentLog('DOM Extractor', `Re-extracting from prior capture ${prior.entry.id}`, {
        level: 'info',
      });
      const reResult = await extractJobsFromHtml(prior.html, url, {
        slug: sourceSlugRaw ?? undefined,
      });
      if (reResult.listings.length > 0) {
        agentLog(
          'DOM Extractor',
          `Recovered ${reResult.listings.length} listings from saved capture`,
          { level: 'success' },
        );
        result = reResult;
      }
    }
  }

  if (isStopRequested()) throw new Error(STOP_REQUESTED_MSG);

  // 6. Classify page from cleaned HTML
  brainOrchestrate(`Classifying page → Page Classifier`, { phase: 'Classify' });
  let pageType = 'listing';
  try {
    const classification = await classifyPage(cleanedHtml, url);
    pageType = classification.type;
    await updateCaptureType(sourceSlug, capture.id, classification.type, result.listings.length);
    agentLog(
      'Page Classifier',
      `Type: ${classification.type} (confidence: ${classification.confidence.toFixed(2)}, method: ${classification.method})`,
      { level: 'info' },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agentLog('Page Classifier', `Classification failed: ${msg}`, { level: 'warn' });
  }

  // 7. Update capture manifest with actual extraction results
  await updateCaptureType(
    sourceSlug,
    capture.id,
    pageType as import('@careersignal/agents').PageType,
    result.listings.length,
  );

  // 8. Normalize and upsert jobs
  if (result.listings.length > 0) {
    brainOrchestrate(`Normalizing ${result.listings.length} jobs`, { phase: 'Normalize' });
    let upserted = 0;
    let failed = 0;
    for (const raw of result.listings) {
      try {
        const row = normalizeJobForCache(raw, sourceId);
        await upsertJobListingCache(db, row);
        upserted++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        agentLog('Normalizer', `Failed to upsert job "${raw.title}": ${msg}`, { level: 'warn' });
      }
    }
    agentLog(
      'Normalizer',
      `Upserted ${upserted} jobs to job_listings_cache${failed > 0 ? ` (${failed} failed)` : ''}`,
      { level: upserted > 0 ? 'success' : 'warn' },
    );
  }

  // 9. Discover ALL links from cleaned HTML and add to frontier
  const candidateLinks = extractLinksFromHtml(cleanedHtml, url);
  agentLog('Link Filter', `Found ${candidateLinks.length} candidate links on page`, {
    level: 'info',
  });

  const filtered = filterLinks(candidateLinks, {
    sourceDomain,
    urlSeen: state.urlSeen,
    frontier: state.frontier,
    currentDepth: depth,
    maxDepth: state.maxDepth,
  });

  if (filtered.length > 0) {
    state.frontier.push(...filtered);
    agentLog(
      'Link Filter',
      `Added ${filtered.length} new URLs to frontier (frontier now: ${state.frontier.length}, seen: ${state.urlSeen.size})`,
      { level: 'success' },
    );
  } else {
    agentLog(
      'Link Filter',
      `No new URLs to add (${candidateLinks.length} candidates, all seen/filtered)`,
      { level: 'info' },
    );
  }

  // Auto-seed pagination when we find a listing page
  if (pageType === 'listing' || pageType === 'category_listing') {
    const paginationSeeds = generatePaginationSeeds(url, 30);
    const newPagination = paginationSeeds.filter(
      (u) =>
        !state.urlSeen.has(normalizeUrl(u)) &&
        !state.frontier.some((f) => normalizeUrl(f.url) === normalizeUrl(u)),
    );
    if (newPagination.length > 0) {
      for (const pu of newPagination) {
        state.frontier.push({ url: pu, depth: depth + 1, priority: 75 });
      }
      agentLog(
        'Link Filter',
        `Auto-seeded ${newPagination.length} pagination URLs from listing page`,
        { level: 'info' },
      );
    }
  }

  return {
    captureId: capture.id,
    rawHtml,
    cleanedHtml,
    jobsExtracted: result.listings.length,
    extractionStrategy: result.strategy,
    pageType,
    linksDiscovered: filtered.length,
  };
}

// ── Scrape one source with Planner→Brain loop ───────────────────────────────

async function scrapeOneSourceWithPlanner(
  db: ReturnType<typeof getDb>,
  source: { id: string; name: string; url: string; slug: string | null; type: string },
  options: {
    visible?: boolean;
    sharedBrowser?: Browser | null;
    sharedPage?: Page | null;
    cycle: number;
  },
): Promise<{ jobsExtracted: number }> {
  const sourceSlug = source.slug ?? source.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const sourceDomain = getSourceDomain(source.url);

  // Seed with source URL + previously successful listing URLs for cross-run diversity
  const seedUrls = [source.url];
  try {
    const priorCaptures = await listCaptures(sourceSlug);
    const priorListingUrls = priorCaptures
      .filter(
        (c) =>
          c.jobsExtracted > 0 &&
          (c.type === 'listing' || c.type === 'company_careers' || c.type === 'category_listing'),
      )
      .map((c) => c.url)
      .filter((u) => u && u !== source.url);
    const unique = [...new Set(priorListingUrls)];
    seedUrls.push(...unique.slice(0, 10));
    if (unique.length > 0) {
      agentLog(
        'Scraper',
        `Cross-run diversity: seeding ${Math.min(unique.length, 10)} prior listing URLs`,
        { level: 'info' },
      );
    }
  } catch {
    // No prior captures, proceed with just source URL
  }
  const state = createPlannerState(source, seedUrls);

  const persistedVisited = await getVisitedUrlsForSource(db, source.id);
  persistedVisited.forEach((u) => state.urlSeen.add(u));
  if (persistedVisited.size > 0) {
    agentLog(
      'Scraper',
      `Loaded ${persistedVisited.size} previously visited URLs from DB (will not re-visit)`,
      { level: 'info' },
    );
  }

  const headless = !options.visible;
  const useShared = Boolean(options.sharedBrowser && options.sharedPage);
  let browser: Browser | null = null;
  let page: Page;

  try {
    if (useShared) {
      browser = null;
      page = options.sharedPage!;
    } else {
      browser = await chromium.launch({ headless, args: STEALTH_ARGS });
      page = await browser.newPage();
    }

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    let totalJobsExtracted = 0;
    let iterations = 0;

    while (true) {
      iterations++;

      if (totalJobsExtracted >= MAX_JOBS_PER_SOURCE) {
        brainOrchestrate(
          `${source.name}: job cap reached (${MAX_JOBS_PER_SOURCE}). Moving to next source.`,
        );
        agentLog(
          'Scraper',
          `${source.name}: extracted ${totalJobsExtracted} jobs (cap ${MAX_JOBS_PER_SOURCE}). Done.`,
          { level: 'success' },
        );
        await setBlessedSourceScraped(db, source.id, 'SUCCESS');
        if (!useShared && browser) {
          await browser.close();
          browser = null;
        }
        return { jobsExtracted: totalJobsExtracted };
      }

      const { stopRequested } = getScraperStatus();
      if (stopRequested) {
        state.stopRequested = true;
      }

      const action = planNextAction(state);
      brainOrchestrate(
        `Planner → ${action.type}${action.type === 'VISIT_URL' ? ` (depth ${(action as { depth: number }).depth}: ${(action as { url: string }).url})` : ''}`,
        { phase: action.type },
      );

      switch (action.type) {
        case 'VISIT_URL': {
          const { url, depth } = action;
          agentLog('Navigator', `[${iterations}] Visiting ${url} (depth ${depth})`, {
            level: 'info',
          });

          try {
            // Validate first
            let validationPassed = true;
            let validationMessage: string | undefined;
            try {
              const validation = await validateSource(source.id, url);
              validationPassed = validation.isValid;
              validationMessage =
                validation.errorMessage ??
                (validation.statusCode ? String(validation.statusCode) : undefined);
              if (!validation.isValid) {
                agentLog('Source Validator', `Invalid: ${validationMessage}`, { level: 'warn' });
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              agentLog('Source Validator', `Validation error (${msg}), proceeding`, {
                level: 'warn',
              });
            }

            // Full visit pipeline: navigate → clean → extract → classify → discover
            let visitResult: VisitResult;
            try {
              visitResult = await visitAndProcess(
                page,
                url,
                depth,
                sourceSlug,
                source.slug,
                source.id,
                sourceDomain,
                state,
                db,
              );
            } catch (visitErr) {
              if (visitErr instanceof Error && visitErr.message === STOP_REQUESTED_MSG) {
                state.stopRequested = true;
                break;
              }
              throw visitErr;
            }

            totalJobsExtracted += visitResult.jobsExtracted;

            if (visitResult.jobsExtracted === 0) {
              state.consecutiveZeroJobVisits++;
            } else {
              state.consecutiveZeroJobVisits = 0;
            }

            try {
              await markUrlVisited(db, source.id, normalizeUrl(url));
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              agentLog('Scraper', `Failed to persist visited URL: ${msg}`, { level: 'warn' });
            }

            // Set last result for Planner
            state.lastResult = {
              captureId: visitResult.captureId,
              pageType: visitResult.pageType as import('@careersignal/agents').PageType | null,
              jobsCount: visitResult.jobsExtracted,
              visitedUrl: url,
              visitedDepth: depth,
            };

            // Brain analysis (LLM)
            const captureHistory = await getCaptureContextSummary(sourceSlug);
            let decision: BrainDecision;
            try {
              decision = await runBrainAnalysis({
                sourceName: source.name,
                sourceUrl: url,
                sourceSlug: source.slug,
                jobsExtracted: visitResult.jobsExtracted,
                validationPassed,
                validationMessage,
                recentLogSnippet: getRecentLogsSnippet(20),
                htmlCharCount: visitResult.rawHtml.length,
                cycleNumber: options.cycle,
                extractionStrategy: visitResult.extractionStrategy,
                attemptNumber: state.retryCount + 1,
                captureHistory,
                pageType: visitResult.pageType,
                depth,
                frontierSize: state.frontier.length,
                urlCorrectionAttempts: state.urlCorrectionAttempts,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              brainOrchestrate(`Brain analysis failed: ${msg}. Continuing.`);
              decision = {
                verdict: 'ok',
                message: 'Brain unavailable',
                nextAction: 'CONTINUE',
                cycleDelaySeconds: 10,
              };
            }

            // Map Brain decision to adaptation (only if not CONTINUE)
            if (decision.nextAction !== 'CONTINUE') {
              const adaptMap: Record<string, BrainAdaptation> = {
                RETRY_EXTRACTION: 'RETRY_EXTRACTION',
                TRY_NEW_URL: 'TRY_NEW_URL',
                CAPTCHA_HUMAN_SOLVE: 'CAPTCHA_HUMAN_SOLVE',
                LOGIN_WALL_HUMAN: 'LOGIN_WALL_HUMAN',
                RETRY_CYCLE_SOON: 'RETRY_CYCLE_SOON',
              };
              if (state.lastResult) {
                state.lastResult.adaptation = adaptMap[decision.nextAction] ?? null;
                state.lastResult.suggestedUrl = decision.suggestedUrl;
                state.lastResult.waitMs = decision.waitSeconds
                  ? decision.waitSeconds * 1000
                  : undefined;
              }
            }

            agentLog(
              'Scraper',
              `Page done: ${visitResult.jobsExtracted} jobs, ${visitResult.linksDiscovered} new links, frontier: ${state.frontier.length}`,
              { level: 'info' },
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            agentLog('Navigator', `Failed to visit ${url}: ${msg}`, { level: 'error' });
            state.lastResult = {
              captureId: '',
              pageType: 'error',
              jobsCount: 0,
              error: msg,
              visitedUrl: url,
              visitedDepth: depth,
            };
          }
          break;
        }

        case 'TRIGGER_LOGIN_WALL': {
          const { url } = action;
          brainOrchestrate(`Login wall detected. Opening visible browser for human login.`);
          agentLog('Brain', 'Opening visible browser for login', { level: 'info' });

          const loginBrowser = await chromium.launch({ headless: false, args: STEALTH_ARGS });
          const loginPage = await loginBrowser.newPage();
          await loginPage.setViewportSize({ width: 1280, height: 720 });
          await loginPage.goto(url, { waitUntil: 'load', timeout: 30000 });

          const htmlPromise = registerLoginWait(loginPage);
          const timeoutMs = 5 * 60 * 1000;
          try {
            const html = await Promise.race([
              htmlPromise,
              new Promise<string>((_, rej) =>
                setTimeout(() => rej(new Error('Login wait timeout (5 min)')), timeoutMs),
              ),
              createStopRacePromise(),
            ]);

            brainOrchestrate('User logged in. Processing page.');
            const cleanResult = cleanHtml(html, url);
            const loginExtract = await extractJobsFromHtml(cleanResult.html, url, {
              slug: source.slug ?? undefined,
            });
            const capture = await saveSourceCapture(sourceSlug, url, html, {
              jobsExtracted: loginExtract.listings.length,
              strategy: `login_${loginExtract.strategy}`,
              depth: 0,
            });
            await saveCleanedCapture(sourceSlug, capture.id, cleanResult.html);

            if (loginExtract.listings.length > 0) {
              let upserted = 0;
              for (const raw of loginExtract.listings) {
                const row = normalizeJobForCache(raw, source.id);
                await upsertJobListingCache(db, row);
                upserted++;
              }
              totalJobsExtracted += upserted;
              agentLog('Normalizer', `Upserted ${upserted} jobs (post-login)`, {
                level: 'success',
              });
            }

            // Discover links from post-login page
            const postLoginLinks = extractLinksFromHtml(cleanResult.html, url);
            const filtered = filterLinks(postLoginLinks, {
              sourceDomain,
              urlSeen: state.urlSeen,
              frontier: state.frontier,
              currentDepth: 0,
              maxDepth: state.maxDepth,
            });
            if (filtered.length > 0) {
              state.frontier.push(...filtered);
              agentLog('Link Filter', `Post-login: added ${filtered.length} URLs to frontier`, {
                level: 'info',
              });
            }

            state.lastResult = {
              captureId: capture.id,
              pageType: null,
              jobsCount: loginExtract.listings.length,
              visitedUrl: url,
              visitedDepth: 0,
            };
          } catch (err) {
            if (err instanceof Error && err.message === STOP_REQUESTED_MSG) {
              state.stopRequested = true;
              await loginBrowser.close();
              break;
            }
            const msg = err instanceof Error ? err.message : String(err);
            agentLog('Brain', `Login wait failed: ${msg}`, { level: 'warn' });
            agentLog('Brain', 'Skipping this URL and continuing with next in frontier.', {
              level: 'info',
            });
            const skippedNormalized = normalizeUrl(url);
            state.urlSeen.add(skippedNormalized);
            const before = state.frontier.length;
            state.frontier = state.frontier.filter(
              (f) => normalizeUrl(f.url) !== skippedNormalized,
            );
            const removed = before - state.frontier.length;
            if (removed > 0) {
              agentLog('Brain', `Removed ${removed} duplicate(s) of this URL from frontier.`, {
                level: 'info',
              });
            }
            state.lastResult = {
              captureId: '',
              pageType: null,
              jobsCount: 0,
              visitedUrl: url,
              visitedDepth: 0,
              adaptation: null,
            };
          } finally {
            await loginBrowser.close();
          }
          break;
        }

        case 'TRIGGER_CAPTCHA': {
          const { url } = action;
          brainOrchestrate(`Captcha suspected. Opening visible browser for human solve.`);
          agentLog('Brain', 'Opening visible browser for captcha solve', { level: 'info' });

          const captchaBrowser = await chromium.launch({ headless: false, args: STEALTH_ARGS });
          const captchaPage = await captchaBrowser.newPage();
          await captchaPage.setViewportSize({ width: 1280, height: 720 });
          await captchaPage.goto(url, { waitUntil: 'load', timeout: 30000 });

          const htmlPromise = registerCaptchaSolve(captchaPage);
          const timeoutMs = 5 * 60 * 1000;
          try {
            const html = await Promise.race([
              htmlPromise,
              new Promise<string>((_, rej) =>
                setTimeout(() => rej(new Error('Captcha solve timeout (5 min)')), timeoutMs),
              ),
              createStopRacePromise(),
            ]);

            brainOrchestrate('Captcha solved. Processing page.');
            const cleanResult = cleanHtml(html, url);
            const captchaExtract = await extractJobsFromHtml(cleanResult.html, url, {
              slug: source.slug ?? undefined,
            });
            const capture = await saveSourceCapture(sourceSlug, url, html, {
              jobsExtracted: captchaExtract.listings.length,
              strategy: `captcha_${captchaExtract.strategy}`,
              depth: 0,
            });
            await saveCleanedCapture(sourceSlug, capture.id, cleanResult.html);

            if (captchaExtract.listings.length > 0) {
              let upserted = 0;
              for (const raw of captchaExtract.listings) {
                const row = normalizeJobForCache(raw, source.id);
                await upsertJobListingCache(db, row);
                upserted++;
              }
              totalJobsExtracted += upserted;
              agentLog('Normalizer', `Upserted ${upserted} jobs (post-captcha)`, {
                level: 'success',
              });
            }

            // Discover links from post-captcha page
            const postCaptchaLinks = extractLinksFromHtml(cleanResult.html, url);
            const filtered = filterLinks(postCaptchaLinks, {
              sourceDomain,
              urlSeen: state.urlSeen,
              frontier: state.frontier,
              currentDepth: 0,
              maxDepth: state.maxDepth,
            });
            if (filtered.length > 0) {
              state.frontier.push(...filtered);
              agentLog('Link Filter', `Post-captcha: added ${filtered.length} URLs to frontier`, {
                level: 'info',
              });
            }

            state.lastResult = {
              captureId: capture.id,
              pageType: null,
              jobsCount: captchaExtract.listings.length,
              visitedUrl: url,
              visitedDepth: 0,
            };
          } catch (err) {
            if (err instanceof Error && err.message === STOP_REQUESTED_MSG) {
              state.stopRequested = true;
              await captchaBrowser.close();
              break;
            }
            const msg = err instanceof Error ? err.message : String(err);
            agentLog('Brain', `Captcha solve failed: ${msg}`, { level: 'warn' });
            agentLog('Brain', 'Skipping this URL and continuing with next in frontier.', {
              level: 'info',
            });
            const skippedNormalized = normalizeUrl(url);
            state.urlSeen.add(skippedNormalized);
            const before = state.frontier.length;
            state.frontier = state.frontier.filter(
              (f) => normalizeUrl(f.url) !== skippedNormalized,
            );
            const removed = before - state.frontier.length;
            if (removed > 0) {
              agentLog('Brain', `Removed ${removed} duplicate(s) of this URL from frontier.`, {
                level: 'info',
              });
            }
            state.lastResult = {
              captureId: '',
              pageType: null,
              jobsCount: 0,
              visitedUrl: url,
              visitedDepth: 0,
              adaptation: null,
            };
          } finally {
            await captchaBrowser.close();
          }
          break;
        }

        case 'APPLY_URL_CORRECTION': {
          const { url: currentUrl, sourceName } = action;
          brainOrchestrate(`URL correction → URL Resolver`, { phase: 'URLCorrection' });
          agentLog('URL Resolver', `Attempting correction for ${sourceName}`, { level: 'info' });

          try {
            const resolveResult = await resolveUrl(
              currentUrl,
              sourceName,
              state.urlCorrectionAttempts,
            );
            state.urlCorrectionAttempts += resolveResult.attemptsMade;

            if (resolveResult.correctedUrl) {
              agentLog(
                'URL Resolver',
                `Corrected URL: ${resolveResult.correctedUrl} (method: ${resolveResult.method})`,
                { level: 'success' },
              );
              await updateBlessedSourceUrl(db, source.id, resolveResult.correctedUrl);
              state.frontier.unshift({ url: resolveResult.correctedUrl, depth: 0 });
            } else {
              agentLog(
                'URL Resolver',
                `No correction found after ${resolveResult.attemptsMade} attempts`,
                { level: 'warn' },
              );
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            agentLog('URL Resolver', `URL correction failed: ${msg}`, { level: 'error' });
          }

          if (state.lastResult) {
            state.lastResult.adaptation = null;
          }
          break;
        }

        case 'RETRY_WAIT': {
          const { waitMs, reason, retryUrl, retryDepth } = action;
          brainOrchestrate(`Waiting ${waitMs / 1000}s (${reason})`);
          agentLog('Brain', `Retrying in ${waitMs / 1000}s`, { level: 'info' });
          try {
            await sleepWithStopCheck(waitMs);
          } catch (e) {
            if (e instanceof Error && e.message === STOP_REQUESTED_MSG) {
              state.stopRequested = true;
              break;
            }
            throw e;
          }

          // Re-add the URL to the front of the frontier for retry
          state.frontier.unshift({ url: retryUrl, depth: retryDepth });
          // Remove from urlSeen so it gets visited again
          state.urlSeen.delete(normalizeUrl(retryUrl));
          break;
        }

        case 'CYCLE_DONE': {
          if (action.reason === 'Stop requested') {
            brainOrchestrate(`Source ${source.name} stopping (user requested).`);
            agentLog(
              'Scraper',
              `${source.name}: stop requested. ${totalJobsExtracted} jobs from ${state.urlSeen.size} pages.`,
              { level: 'info' },
            );
            const status = totalJobsExtracted > 0 ? 'SUCCESS' : 'PARTIAL';
            await setBlessedSourceScraped(db, source.id, status);
            if (!useShared && browser) {
              await browser.close();
              browser = null;
            }
            return { jobsExtracted: totalJobsExtracted };
          }

          brainOrchestrate(
            `Frontier empty (${action.reason}). Repopulating from captures or re-seeding start URL.`,
          );
          agentLog(
            'Scraper',
            `${source.name}: ${action.reason}. Repopulating frontier from captures…`,
            { level: 'info' },
          );
          await repopulateFrontierFromCaptures(state, sourceSlug, source, sourceDomain);
          break;
        }
      }
    }
  } catch (err) {
    if (browser) await browser.close();
    const msg = err instanceof Error ? err.message : String(err);
    agentLog('Scraper', `${source.name} failed: ${msg}`, { level: 'error', detail: String(err) });
    await setBlessedSourceScraped(db, source.id, 'FAILED');
    return { jobsExtracted: 0 };
  }
}

// ── Main loop ───────────────────────────────────────────────────────────────

export async function runScrapeLoop(): Promise<void> {
  const db = getDb();
  let cycle = 0;
  let sharedBrowser: Browser | null = null;
  let sharedPage: Page | null = null;

  while (true) {
    const { stopRequested } = getScraperStatus();
    if (stopRequested) {
      brainOrchestrate('Stop requested. Exiting loop.');
      agentLog('Scraper', 'Stop requested. Exiting loop.', { level: 'info' });
      break;
    }

    cycle++;
    const sources = (await listBlessedSources(db)).filter((s) => s.enabledForScraping);
    const { visibleMode } = getScraperStatus();

    brainOrchestrate(`Planning cycle ${cycle}`, {
      phase: `Enabled sources: ${sources.length}. ${sources.map((s) => s.name).join(', ') || 'None'}`,
    });
    agentLog('Scraper', `Starting cycle ${cycle}...`, { level: 'info' });

    if (sources.length === 0) {
      brainOrchestrate('No enabled sources. Will wait and retry next cycle.');
      agentLog('Scraper', 'No enabled sources. Waiting for next cycle.', { level: 'warn' });
    } else {
      const runParallel = sources.length > 1;
      if (visibleMode && !sharedBrowser && !runParallel) {
        agentLog('Navigator', 'Visible mode: launching browser (stays open).', { level: 'info' });
        sharedBrowser = await chromium.launch({ headless: false, args: STEALTH_ARGS });
        sharedPage = await sharedBrowser.newPage();
        await sharedPage.setViewportSize({ width: 1280, height: 720 });
        await sharedPage.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      }

      if (runParallel) {
        for (let i = 0; i < sources.length; i += MAX_PARALLEL_SOURCES) {
          const { stopRequested: sr } = getScraperStatus();
          if (sr) break;
          const chunk = sources.slice(i, i + MAX_PARALLEL_SOURCES);
          brainOrchestrate(
            `Running ${chunk.length} source(s) in parallel: ${chunk.map((s) => s.name).join(', ')}`,
          );
          agentLog(
            'Scraper',
            `Parallel scrape: ${chunk.map((s) => s.name).join(', ')} (${chunk.length} of ${sources.length} sources)`,
            { level: 'info' },
          );
          await Promise.all(
            chunk.map((source) =>
              scrapeOneSourceWithPlanner(db, source, {
                visible: visibleMode,
                sharedBrowser: null,
                sharedPage: null,
                cycle,
              }),
            ),
          );
        }
      } else {
        for (const source of sources) {
          const { stopRequested: sr } = getScraperStatus();
          if (sr) break;

          brainOrchestrate(
            `Orchestrating: ${source.name}. Planner → Brain loop with aggressive frontier crawl.`,
          );

          await scrapeOneSourceWithPlanner(db, source, {
            visible: visibleMode,
            sharedBrowser: visibleMode ? sharedBrowser : null,
            sharedPage: visibleMode ? sharedPage : null,
            cycle,
          });
        }
      }
    }

    const { stopRequested: sr } = getScraperStatus();
    if (sr) break;

    brainOrchestrate(`Sleeping ${DEFAULT_CYCLE_DELAY_MS / 1000}s until next cycle.`);
    agentLog('Scraper', `Sleeping ${DEFAULT_CYCLE_DELAY_MS / 1000}s until next cycle...`, {
      level: 'info',
    });
    await new Promise((r) => setTimeout(r, DEFAULT_CYCLE_DELAY_MS));
  }

  if (sharedBrowser) {
    agentLog('Scraper', 'Closing visible browser.', { level: 'info' });
    await sharedBrowser.close();
    sharedBrowser = null;
    sharedPage = null;
  }

  // Always update state and DB when loop exits (stop or finish)
  setScraperActive(false);
  setStopRequested(false);
  try {
    await setScrapeRunning(db, false);
    await clearAdminLogs(db);
  } catch (e) {
    // ignore DB errors on teardown
  }
  clearAgentLogs();
  clearBrainLogs();

  brainOrchestrate('Loop stopped.');
  agentLog('Scraper', 'Loop stopped.', { level: 'success' });
}
