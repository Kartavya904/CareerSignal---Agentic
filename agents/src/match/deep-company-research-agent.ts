/**
 * Deep Company Research Agent
 *
 * Given a company name (plus optional URL/context), this agent:
 * - Locates and fetches key public pages (home, about, careers, jobs, blog/press).
 * - Uses an LLM to infer a rich company profile aligned with the `companies` table.
 * - Computes a core-field coverage ratio so callers can decide when enrichment is \"good enough\".
 *
 * NOTE: This agent is DB-agnostic. It returns a draft enrichment record; callers
 * are responsible for persisting it via the DB helpers in `@careersignal/db`.
 */

import type { Page } from 'playwright';
import { complete } from '@careersignal/llm';
import {
  searchWeb,
  searchWebViaBrowser,
  isSearchConfigured,
  type SearchResult,
} from './web-search-client.js';
import { shouldRetry } from './retry-review-agent.js';
import {
  createEmptyDossierMemory,
  mergeExtractionIntoMemory,
  urlToDossierSlug,
  CORE_FIELDS,
  FIELD_PRIORITY_MUST_HAVE,
  FIELD_PRIORITY_TIERS,
  hasValueForCoverage,
  type DossierMemory,
  type DossierDiskWriter,
  type DossierRunCompanyPageRag,
  type DossierPageExtraction,
  type CoreField,
} from './dossier-types.js';
import { cleanHtml } from '../browser/html-cleanup-agent.js';

export interface DeepCompanyResearchInput {
  companyName: string;
  /**
   * A seed URL closely related to the company. Usually the job posting URL or
   * the company's careers URL from the application assistant pipeline.
   */
  seedUrl?: string;
  /**
   * Optional extra context (e.g. job description text) that can help resolve
   * ambiguous names or infer remote policy / tech stack hints.
   */
  jobDescriptionText?: string;
  /**
   * Optional logger for progress visibility.
   */
  log?: (event: { level: 'info' | 'warn' | 'error'; message: string }) => void;
  /**
   * Hard cap for total runtime (ms). Individual HTTP/LLM calls have their own
   * timeouts, but this lets callers fail-fast if needed.
   */
  hardTimeoutMs?: number;
  /**
   * When set, discovery uses this Playwright page to run DuckDuckGo searches (no API key).
   * Caller must launch the browser and close it after the run.
   */
  browserPage?: Page;
  /**
   * When set with dossierWriter and runCompanyPageRag, runs the full dossier pipeline:
   * per-URL RAG, running memory, orchestrator loop until ≥70% or exhausted, final synthesis.
   */
  runFolderName?: string;
  /** Disk writer for dossier run artifacts (required when runFolderName is set). */
  dossierWriter?: DossierDiskWriter;
  /** RAG runner for each company page (required when runFolderName is set). */
  runCompanyPageRag?: DossierRunCompanyPageRag;
}

export interface DeepCompanyEnrichmentDraft {
  companyName: string;
  normalizedName: string;
  primaryUrl: string | null;
  websiteDomain: string | null;

  // Core fields (priority order = CORE_FIELDS in dossier-types)
  descriptionText: string | null;
  longCompanyDescription: string | null;
  industries: string[] | null;
  headquartersAndOffices: string | null;
  companyStage: string | null;
  sizeRange: string | null;
  foundedYear: number | null;
  careersPageUrl: string | null;
  linkedInCompanyUrl: string | null;
  remotePolicy: string | null;
  remoteFriendlyLocations: string[] | null;
  sponsorshipSignals: Record<string, unknown> | null;
  workAuthorizationRequirements: string | null;
  hiringLocations: string[] | null;
  benefitsHighlights: string | null;
  fundingStage: string | null;
  publicCompany: boolean | null;
  ticker: string | null;
  missionStatement: string | null;
  coreValues: string[] | null;
  typicalHiringProcess: string | null;
  interviewProcess: string | null;
  interviewFormatHints: string[] | null;
  applicationTipsFromCareersPage: string | null;
  salaryByLevel: Record<string, unknown> | null;
  techStackHints: string[] | null;
  jobCountOpen: number | null;
  hiringTrend: string | null;
  recentLayoffsOrRestructuring: string | null;
  jobCountTotal: number | null;

  visitedUrls: string[];
  coreFieldCoverage: number;
  missingCoreFields: string[];
  fieldConfidence?: Partial<Record<CoreField, number>>;
}

function logIf(
  logger: DeepCompanyResearchInput['log'],
  level: 'info' | 'warn' | 'error',
  message: string,
) {
  if (logger) logger({ level, message });
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
}

function textFromHtml(html: string, maxLength = 60000): string {
  const stripped = stripScripts(html);
  // Very lightweight tag stripping; LLM can still handle some markup.
  const noTags = stripped.replace(/<[^>]+>/g, ' ');
  return noTags.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function extractDomainFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

function companySlugFromName(name: string): string | null {
  const slug = name
    .replace(/\s*[(\[].*?[)\]]\s*$/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  if (!slug) return null;
  return slug;
}

function isLikelyAtsHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.includes('lever.co') ||
    h.includes('greenhouse.io') ||
    h.includes('ashbyhq.com') ||
    h.includes('smartrecruiters.com') ||
    h.includes('workday.com') ||
    h.includes('myworkdayjobs.com') ||
    h.includes('jobvite.com') ||
    h.includes('icims.com')
  );
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'CareerSignal/1.0 (+https://careersignal.ai)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch URL via Playwright page (for JS-rendered or bot-blocked pages). */
async function fetchWithBrowser(
  page: Page,
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(2000);
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // ignore
    }
    const html = await page.content();
    return html ?? null;
  } catch {
    return null;
  }
}

/** Normalize URL for dedupe: lowercase host, strip trailing slash and common tracking params. */
function normalizeUrlForDedupe(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    let path = u.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    u.pathname = path;
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return url;
  }
}

/** True for obvious junk/tracking URLs we should never visit (ads, DDG/Exa tracking, etc.). */
function isJunkUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    const query = u.search.toLowerCase();

    if (host.includes('duckduckgo.com')) return true;
    if (host.includes('exa.ai')) return true;
    if (host.includes('doubleclick.net')) return true;
    if (host.includes('googlesyndication.com')) return true;

    if (path.includes('/y.js')) return true;
    if (path.includes('/aclick')) return true;
    if (query.includes('ad_domain=') || query.includes('ad_provider=')) return true;

    return false;
  } catch {
    return false;
  }
}

/** Fetch URL with retry: plain fetch first, then browser if retry review says so (empty/short content). */
async function fetchUrlWithRetry(
  url: string,
  options: {
    timeoutMs: number;
    minChars?: number;
    log: DeepCompanyResearchInput['log'];
    browserPage?: Page | null;
    withinBudget: () => boolean;
    action: 'fetch_url' | 'fetch_url_fallback_path';
  },
): Promise<string | null> {
  const { timeoutMs, minChars = 500, log, browserPage, withinBudget, action } = options;
  let attempt = 0;
  let html: string | null = await fetchWithTimeout(url, timeoutMs);
  const hasBrowser = !!browserPage;

  while (withinBudget()) {
    const charCount = html?.length ?? 0;
    if (charCount >= minChars) return html;

    const review = shouldRetry({
      action,
      context: { url, charCount, hasBrowser, attempt, maxRetries: 1 },
    });
    if (!review.shouldRetry || !review.method) {
      logIf(
        log,
        'warn',
        `Skip (empty or fail): ${url} (got ${charCount} chars). ${review.reason ?? ''}`,
      );
      return null;
    }
    if (review.method === 'browser' && browserPage) {
      logIf(log, 'info', `Retry with browser: ${url}`);
      html = await fetchWithBrowser(browserPage, url, Math.min(timeoutMs + 5000, 30_000));
      attempt++;
      continue;
    }
    if (review.method === 'fetch_retry') {
      logIf(log, 'info', `Retry fetch: ${url}`);
      html = await fetchWithTimeout(url, timeoutMs);
      attempt++;
      continue;
    }
    break;
  }
  return html;
}

/** Score for ranking: Wikipedia and official-looking domains first, then Reddit, then others. */
function urlSourceScore(url: string, companySlug: string): number {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('wikipedia.org')) return 100;
    if (host.includes('reddit.com')) return 85;
    if (host.includes('crunchbase.com') || host.includes('linkedin.com/company')) return 80;
    if (
      host.includes('bloomberg.com') ||
      host.includes('reuters.com') ||
      host.includes('techcrunch.com')
    )
      return 75;
    if (host.includes('glassdoor.com') || host.includes('indeed.com')) return 70;
    if (companySlug && host.includes(companySlug)) return 95;
    if (host.startsWith('www.') && host.slice(4).includes(companySlug)) return 95;
    return 50;
  } catch {
    return 50;
  }
}

const SEARCH_QUERIES = [
  (name: string) => `${name} official website`,
  (name: string) => `${name} company about us`,
  (name: string) => `${name} Wikipedia`,
];

const MAX_SEARCH_QUERIES = SEARCH_QUERIES.length;
const MAX_URLS_TO_FETCH = 22;
/** From each browser search we take only the top N results (real search results, not synthetic). */
const TOP_URLS_PER_SEARCH = 1;
const SEARCH_DELAY_MS = 800;
const FALLBACK_SEARCH_DELAY_MS = 400;

/** True if the result title contains the company name (case-insensitive). Used to skip random top results that don't mention the company. */
function resultTitleMatchesCompany(title: string, companyName: string): boolean {
  const normalized = companyName.trim().toLowerCase();
  if (!normalized) return false;
  return title.trim().toLowerCase().includes(normalized);
}

/**
 * Discover URLs via SerpAPI (when key is set). Returns ranked, deduped URLs to fetch.
 */
async function discoverUrlsViaSearch(
  companyName: string,
  log: DeepCompanyResearchInput['log'],
  withinBudget: () => boolean,
): Promise<SearchResult[]> {
  if (!isSearchConfigured()) return [];

  const companySlug = companySlugFromName(companyName) ?? '';
  const seen = new Map<string, SearchResult>();

  for (let i = 0; i < Math.min(SEARCH_QUERIES.length, MAX_SEARCH_QUERIES); i++) {
    if (!withinBudget()) break;
    const query = SEARCH_QUERIES[i]!(companyName);
    logIf(log, 'info', `Search: "${query}"`);
    const results = await searchWeb(query, { num: 8 });
    for (const r of results) {
      const key = normalizeUrlForDedupe(r.url);
      if (seen.has(key)) continue;
      seen.set(key, r);
    }
    if (i < SEARCH_QUERIES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS));
    }
  }

  const sorted = [...seen.values()].sort(
    (a, b) => urlSourceScore(b.url, companySlug) - urlSourceScore(a.url, companySlug),
  );
  return sorted.slice(0, MAX_URLS_TO_FETCH);
}

/**
 * Discover URLs via browser (DuckDuckGo). No API key; unlimited local searches.
 * Takes only the top TOP_URLS_PER_SEARCH (e.g. 5) results from each query, dedupes, and optionally
 * reports urlsToVisit after each search via onAfterSearch so memory.json can be updated as we go.
 */
async function discoverUrlsViaBrowser(
  companyName: string,
  page: Page,
  log: DeepCompanyResearchInput['log'],
  withinBudget: () => boolean,
  options?: {
    onAfterSearch?: (
      query: string,
      extractedCount: number,
      urlsToVisit: string[],
    ) => void | Promise<void>;
  },
): Promise<SearchResult[]> {
  const seen = new Map<string, SearchResult>();
  const urlsOrder: string[] = [];
  const companySlug = companySlugFromName(companyName) ?? '';

  for (let i = 0; i < Math.min(SEARCH_QUERIES.length, MAX_SEARCH_QUERIES); i++) {
    if (!withinBudget()) break;
    const query = SEARCH_QUERIES[i]!(companyName);
    const prevLength = urlsOrder.length;

    const results = await searchWebViaBrowser(page, query);
    // Select the first result whose title contains the company name, skipping ads/junk and duplicates.
    const firstMatch = results.find((r) => {
      if (!resultTitleMatchesCompany(r.title, companyName)) return false;
      if (isJunkUrl(r.url)) return false;
      const key = normalizeUrlForDedupe(r.url);
      if (seen.has(key)) return false;
      return true;
    });

    if (firstMatch) {
      const key = normalizeUrlForDedupe(firstMatch.url);
      if (!seen.has(key)) {
        seen.set(key, firstMatch);
        urlsOrder.push(firstMatch.url);
      }
    }

    const extractedCount = urlsOrder.length - prevLength;
    if (extractedCount > 0) {
      logIf(
        log,
        'info',
        `Search (browser): "${query}" Extracted ${extractedCount} links from the results (saved to memory!)`,
      );
    } else {
      logIf(log, 'info', `Search (browser): "${query}"`);
    }

    if (options?.onAfterSearch) {
      await options.onAfterSearch(query, extractedCount, [...urlsOrder]);
    }

    if (i < SEARCH_QUERIES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS));
    }
  }

  return urlsOrder.map((url) => seen.get(normalizeUrlForDedupe(url))!);
}

/**
 * Fallback: derive company domain and try known paths (no search API).
 * Only used when no browser and search returned zero results.
 */
function getFallbackUrls(primaryHost: string): string[] {
  const base = `https://${primaryHost}`;
  return [
    `${base}/`,
    `${base}/about`,
    `${base}/about-us`,
    `${base}/who-we-are`,
    `${base}/our-company`,
    `${base}/careers`,
    `${base}/jobs`,
    `${base}/company`,
  ];
}

/** Turn orchestrator-suggested URLs into search queries so we only fetch URLs that come from real search (when browser is used). */
function urlsToSearchQueries(urls: string[], companyName: string): string[] {
  const out: string[] = [];
  for (const url of urls) {
    try {
      const u = new URL(url);
      const pathPart = u.pathname.replace(/\/+/g, ' ').trim().slice(0, 50);
      out.push(pathPart ? `${companyName} ${pathPart}` : companyName);
    } catch {
      out.push(companyName);
    }
  }
  return out;
}

/** Generate targeted search queries for missing core fields. Missing order = CORE_FIELDS priority. */
function targetedQueriesForMissingFields(missing: string[], companyName: string): string[] {
  const labelMap: Record<string, string> = {
    descriptionText: 'about company',
    longCompanyDescription: 'about company overview',
    industries: 'industries sectors',
    headquartersAndOffices: 'headquarters offices locations',
    companyStage: 'startup growth enterprise',
    sizeRange: 'company size employees',
    foundedYear: 'founded year',
    careersPageUrl: 'careers jobs hiring',
    linkedInCompanyUrl: 'LinkedIn company',
    remotePolicy: 'remote work policy',
    remoteFriendlyLocations: 'remote work locations',
    sponsorshipSignals: 'H1B visa sponsorship',
    workAuthorizationRequirements: 'work authorization visa',
    hiringLocations: 'careers hiring locations',
    benefitsHighlights: 'benefits perks',
    fundingStage: 'funding series stock',
    publicCompany: 'public company stock',
    ticker: 'stock ticker symbol',
    missionStatement: 'mission vision',
    coreValues: 'company values culture',
    typicalHiringProcess: 'hiring process steps',
    interviewProcess: 'interview process',
    interviewFormatHints: 'interview format technical',
    applicationTipsFromCareersPage: 'application tips careers',
    salaryByLevel: 'salary compensation',
    techStackHints: 'tech stack technologies',
    jobCountOpen: 'open jobs careers',
    hiringTrend: 'hiring growth layoffs',
    recentLayoffsOrRestructuring: 'layoffs restructuring',
  };
  return missing.map((f) => `${companyName} ${labelMap[f] ?? f}`).slice(0, 12);
}

/** Coverage from draft using same strict rules as dossier memory (all CORE_FIELDS, no empty/metadata-only). */
function computeCoverage(draft: DeepCompanyEnrichmentDraft): { ratio: number; missing: string[] } {
  let present = 0;
  const missing: string[] = [];
  for (const field of CORE_FIELDS) {
    const value = draft[field];
    if (hasValueForCoverage(value, field)) present++;
    else missing.push(field);
  }
  const ratio = present / CORE_FIELDS.length;
  return { ratio, missing };
}

/**
 * Deep company research from public web.
 */
export async function deepResearchCompany(
  input: DeepCompanyResearchInput,
): Promise<DeepCompanyEnrichmentDraft> {
  if (input.runFolderName && input.dossierWriter && input.runCompanyPageRag) {
    return runDossierPipeline(input);
  }
  return runLegacyDeepResearch(input);
}

async function runLegacyDeepResearch(
  input: DeepCompanyResearchInput,
): Promise<DeepCompanyEnrichmentDraft> {
  const start = Date.now();
  const hardTimeout = input.hardTimeoutMs ?? 90_000;

  function withinBudget(): boolean {
    return Date.now() - start < hardTimeout;
  }

  const domainFromSeed = extractDomainFromUrl(input.seedUrl ?? undefined);
  let primaryHost: string | null = domainFromSeed;

  if (primaryHost && isLikelyAtsHost(primaryHost)) {
    // For ATS job URLs, synthesize a likely company host from the name.
    const slug = companySlugFromName(input.companyName);
    if (slug) {
      primaryHost = `${slug}.com`;
      logIf(
        input.log,
        'info',
        `Seed host looks like ATS; using synthesized company host: ${primaryHost}`,
      );
    }
  }

  if (!primaryHost) {
    const slug = companySlugFromName(input.companyName);
    if (slug) {
      primaryHost = `${slug}.com`;
      logIf(input.log, 'info', `No usable host from seed; using slug-derived host: ${primaryHost}`);
    }
  }

  const visitedUrls: string[] = [];
  const htmlBlobs: { url: string; html: string }[] = [];

  // 1) Open-web search: discover real URLs (browser DuckDuckGo when page provided, else SerpAPI or path-based)
  const searchResults = input.browserPage
    ? await discoverUrlsViaBrowser(input.companyName, input.browserPage, input.log, withinBudget)
    : await discoverUrlsViaSearch(input.companyName, input.log, withinBudget);

  if (searchResults.length > 0) {
    logIf(
      input.log,
      'info',
      `Discovered ${searchResults.length} URLs via search; fetching content...`,
    );
    for (const result of searchResults) {
      if (!withinBudget()) break;
      logIf(input.log, 'info', `Fetching: ${result.url}`);
      const html = await fetchUrlWithRetry(result.url, {
        timeoutMs: 14_000,
        minChars: 500,
        log: input.log,
        browserPage: input.browserPage ?? null,
        withinBudget,
        action: 'fetch_url',
      });
      if (html && html.length > 500) {
        visitedUrls.push(result.url);
        htmlBlobs.push({ url: result.url, html });
        logIf(input.log, 'info', `Fetched OK: ${result.url} (${html.length} chars)`);
      }
    }
    if (htmlBlobs.length > 0 && !primaryHost) {
      primaryHost = extractDomainFromUrl(htmlBlobs[0]!.url) ?? primaryHost;
    }
  }

  // 2) Fallback: if no search or no content from search, use path-based discovery on derived domain
  if (htmlBlobs.length === 0 && primaryHost && withinBudget()) {
    logIf(
      input.log,
      'info',
      'No search results or search not configured; trying known paths on derived domain.',
    );
    const fallbackUrls = getFallbackUrls(primaryHost);
    for (const url of fallbackUrls) {
      if (!withinBudget()) break;
      logIf(input.log, 'info', `Fetching company page: ${url}`);
      const html = await fetchUrlWithRetry(url, {
        timeoutMs: 12_000,
        minChars: 1000,
        log: input.log,
        browserPage: input.browserPage ?? null,
        withinBudget,
        action: 'fetch_url_fallback_path',
      });
      if (html && html.length > 1000) {
        visitedUrls.push(url);
        htmlBlobs.push({ url, html });
        logIf(input.log, 'info', `Fetched OK: ${url} (${html.length} chars)`);
      }
    }
  }

  if (htmlBlobs.length === 0) {
    logIf(
      input.log,
      'warn',
      input.browserPage
        ? 'No page content could be fetched from discovered URLs. Check browser search results or company domain.'
        : 'No page content could be fetched. Use browser-based search (pass browserPage) or set SERPAPI_KEY, or ensure company domain is reachable.',
    );
  }

  const combinedTextParts: string[] = [];
  for (const blob of htmlBlobs) {
    combinedTextParts.push(`URL: ${blob.url}\n\n${textFromHtml(blob.html, 20000)}`);
  }
  if (input.jobDescriptionText) {
    combinedTextParts.push(`Job Description Snippet:\n${input.jobDescriptionText.slice(0, 8000)}`);
  }
  const combinedText = combinedTextParts.join('\n\n----\n\n').slice(0, 100_000);
  logIf(
    input.log,
    'info',
    `Combined context: ${combinedText.length} chars from ${htmlBlobs.length} page(s)`,
  );

  let enriched: DeepCompanyEnrichmentDraft = {
    companyName: input.companyName,
    normalizedName: input.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim(),
    primaryUrl: visitedUrls[0] ?? input.seedUrl ?? null,
    websiteDomain: primaryHost ?? null,
    descriptionText: null,
    longCompanyDescription: null,
    industries: null,
    headquartersAndOffices: null,
    companyStage: null,
    sizeRange: null,
    foundedYear: null,
    careersPageUrl: null,
    linkedInCompanyUrl: null,
    remotePolicy: null,
    remoteFriendlyLocations: null,
    sponsorshipSignals: null,
    workAuthorizationRequirements: null,
    hiringLocations: null,
    benefitsHighlights: null,
    fundingStage: null,
    publicCompany: null,
    ticker: null,
    missionStatement: null,
    coreValues: null,
    typicalHiringProcess: null,
    interviewProcess: null,
    interviewFormatHints: null,
    applicationTipsFromCareersPage: null,
    salaryByLevel: null,
    techStackHints: null,
    jobCountOpen: null,
    hiringTrend: null,
    recentLayoffsOrRestructuring: null,
    jobCountTotal: null,
    visitedUrls,
    coreFieldCoverage: 0,
    missingCoreFields: [],
  };

  if (!withinBudget()) {
    const { ratio, missing } = computeCoverage(enriched);
    enriched.coreFieldCoverage = ratio;
    enriched.missingCoreFields = missing;
    logIf(
      input.log,
      'warn',
      `Deep company research aborted early due to hard timeout; coverage=${(ratio * 100).toFixed(
        0,
      )}%`,
    );
    return enriched;
  }

  // Main LLM extraction with retry on abort/timeout (use smaller context on retry so it finishes in time)
  let mainExtractionDone = false;
  let mainAttempt = 0;
  const MAIN_EXTRACTION_RETRIES = 1;
  const MIN_LLM_TIMEOUT_MS = 90_000; // first attempt: at least 90s so we don't abort immediately after long fetch phase
  const RETRY_LLM_TIMEOUT_MS = 120_000; // retry: 2 min with smaller context

  while (withinBudget() && !mainExtractionDone && mainAttempt <= MAIN_EXTRACTION_RETRIES) {
    try {
      if (mainAttempt > 0) {
        logIf(
          input.log,
          'info',
          `Retrying main LLM extraction (attempt ${mainAttempt + 1}, smaller context)...`,
        );
      } else {
        logIf(input.log, 'info', 'Running LLM extraction (GENERAL model)...');
      }
      const textCap = mainAttempt === 0 ? 100_000 : 55_000;
      const remaining = hardTimeout - (Date.now() - start);
      const timeoutMs =
        mainAttempt === 0
          ? Math.max(MIN_LLM_TIMEOUT_MS, Math.min(300_000, remaining))
          : Math.max(RETRY_LLM_TIMEOUT_MS, Math.min(300_000, remaining));
      const prompt = `You are analyzing public information about a company for a job seeker.

Company name: ${input.companyName}

Using ONLY the information below (company website pages, careers/about pages, and an optional job description snippet), infer as many of the following fields as you can. If a field is not clearly supported by the text, leave it null.

Return a single JSON object with exactly these keys (use null if not found):
- descriptionText: 3–5 sentence overview of what the company does and its mission.
- longCompanyDescription: longer rich description (paragraph or more) if available, else null.
- industries: array of high-level industry labels (e.g. ["Biotech", "SaaS"]); first = primary.
- headquartersAndOffices: "City, Country | City, Country" for HQs and offices, else null.
- companyStage: e.g. "startup", "growth", "scale-up", "enterprise", or null.
- sizeRange: employee count band (e.g. "51-200", "1000+").
- foundedYear: numeric year or null.
- careersPageUrl: primary careers/jobs page URL if seen, else null.
- linkedInCompanyUrl: LinkedIn company page URL if seen, else null.
- remotePolicy: on-site/remote/hybrid stance.
- remoteFriendlyLocations: array of regions/countries where remote is allowed, or null.
- sponsorshipSignals: object with visa/H1B/global hiring evidence (e.g. {"h1bLikelihood":"high"}) or {}.
- workAuthorizationRequirements: any stated work auth requirements, or null.
- hiringLocations: array of cities/countries where they hire.
- benefitsHighlights: short summary of benefits (health, PTO, etc.) or null.
- fundingStage: e.g. "Seed", "Series A", "Public", or null.
- publicCompany: true/false/null.
- ticker: stock symbol if public, else null.
- missionStatement: company mission text or null.
- coreValues: array of stated values or null.
- typicalHiringProcess: steps/timeline if described, else null.
- interviewProcess: interview process description (accumulate detail), or null.
- interviewFormatHints: array e.g. ["technical","behavioral","take-home"] or null.
- applicationTipsFromCareersPage: tips or "what we look for" or null.
- salaryByLevel: object e.g. {"entry":{"min":80,"max":120,"currency":"USD"}} or null.
- techStackHints: array of technologies mentioned.
- jobCountOpen: approximate open job count or null.
- hiringTrend: "growing"|"stable"|"contracting" or null.
- recentLayoffsOrRestructuring: brief note if known, else null.
- jobCountTotal: approximate total jobs if described, else null.

TEXT CONTEXT (URLs + snippets):
${combinedText.slice(0, textCap)}

Return only the JSON object.`;

      const response = await complete(prompt, 'GENERAL', {
        format: 'json',
        temperature: 0.2,
        maxTokens: 1024,
        timeout: timeoutMs,
      });

      let parsed: any;
      try {
        parsed = JSON.parse(response);
      } catch {
        parsed = {};
      }

      const industries =
        Array.isArray(parsed.industries) && parsed.industries.length > 0
          ? parsed.industries.map((x: unknown) => String(x)).slice(0, 10)
          : null;
      const hiringLocations =
        Array.isArray(parsed.hiringLocations) && parsed.hiringLocations.length > 0
          ? parsed.hiringLocations.map((x: unknown) => String(x)).slice(0, 20)
          : null;
      const techStackHints =
        Array.isArray(parsed.techStackHints) && parsed.techStackHints.length > 0
          ? parsed.techStackHints.map((x: unknown) => String(x)).slice(0, 30)
          : null;
      const remoteFriendlyLocations =
        Array.isArray(parsed.remoteFriendlyLocations) && parsed.remoteFriendlyLocations.length > 0
          ? parsed.remoteFriendlyLocations.map((x: unknown) => String(x)).slice(0, 15)
          : null;
      const coreValues =
        Array.isArray(parsed.coreValues) && parsed.coreValues.length > 0
          ? parsed.coreValues.map((x: unknown) => String(x)).slice(0, 10)
          : null;
      const interviewFormatHints =
        Array.isArray(parsed.interviewFormatHints) && parsed.interviewFormatHints.length > 0
          ? parsed.interviewFormatHints.map((x: unknown) => String(x)).slice(0, 10)
          : null;

      enriched = {
        ...enriched,
        descriptionText: parsed.descriptionText ? String(parsed.descriptionText) : null,
        longCompanyDescription: parsed.longCompanyDescription
          ? String(parsed.longCompanyDescription)
          : null,
        industries,
        headquartersAndOffices: parsed.headquartersAndOffices
          ? String(parsed.headquartersAndOffices)
          : null,
        companyStage: parsed.companyStage ? String(parsed.companyStage) : null,
        sizeRange: parsed.sizeRange ? String(parsed.sizeRange) : null,
        foundedYear:
          typeof parsed.foundedYear === 'number'
            ? parsed.foundedYear
            : parsed.foundedYear && !Number.isNaN(Number(parsed.foundedYear))
              ? Number(parsed.foundedYear)
              : null,
        careersPageUrl: parsed.careersPageUrl ? String(parsed.careersPageUrl) : null,
        linkedInCompanyUrl: parsed.linkedInCompanyUrl ? String(parsed.linkedInCompanyUrl) : null,
        remotePolicy: parsed.remotePolicy ? String(parsed.remotePolicy) : null,
        remoteFriendlyLocations,
        sponsorshipSignals:
          parsed.sponsorshipSignals && typeof parsed.sponsorshipSignals === 'object'
            ? parsed.sponsorshipSignals
            : {},
        workAuthorizationRequirements: parsed.workAuthorizationRequirements
          ? String(parsed.workAuthorizationRequirements)
          : null,
        hiringLocations,
        benefitsHighlights: parsed.benefitsHighlights ? String(parsed.benefitsHighlights) : null,
        fundingStage: parsed.fundingStage ? String(parsed.fundingStage) : null,
        publicCompany:
          typeof parsed.publicCompany === 'boolean'
            ? parsed.publicCompany
            : parsed.publicCompany === 'true'
              ? true
              : parsed.publicCompany === 'false'
                ? false
                : null,
        ticker: parsed.ticker ? String(parsed.ticker) : null,
        missionStatement: parsed.missionStatement ? String(parsed.missionStatement) : null,
        coreValues,
        typicalHiringProcess: parsed.typicalHiringProcess
          ? String(parsed.typicalHiringProcess)
          : null,
        interviewProcess: parsed.interviewProcess ? String(parsed.interviewProcess) : null,
        interviewFormatHints,
        applicationTipsFromCareersPage: parsed.applicationTipsFromCareersPage
          ? String(parsed.applicationTipsFromCareersPage)
          : null,
        salaryByLevel:
          parsed.salaryByLevel && typeof parsed.salaryByLevel === 'object'
            ? (parsed.salaryByLevel as Record<string, unknown>)
            : null,
        techStackHints,
        jobCountOpen:
          typeof parsed.jobCountOpen === 'number'
            ? parsed.jobCountOpen
            : parsed.jobCountOpen && !Number.isNaN(Number(parsed.jobCountOpen))
              ? Number(parsed.jobCountOpen)
              : null,
        hiringTrend: parsed.hiringTrend ? String(parsed.hiringTrend) : null,
        recentLayoffsOrRestructuring: parsed.recentLayoffsOrRestructuring
          ? String(parsed.recentLayoffsOrRestructuring)
          : null,
        jobCountTotal:
          typeof parsed.jobCountTotal === 'number'
            ? parsed.jobCountTotal
            : parsed.jobCountTotal && !Number.isNaN(Number(parsed.jobCountTotal))
              ? Number(parsed.jobCountTotal)
              : null,
      };
      mainExtractionDone = true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logIf(input.log, 'warn', `Deep company enrichment LLM call failed: ${errMsg}`);
      const review = shouldRetry({
        action: 'llm_extraction',
        context: {
          errorMessage: errMsg,
          attempt: mainAttempt,
          maxRetries: MAIN_EXTRACTION_RETRIES,
        },
      });
      if (review.shouldRetry && mainAttempt < MAIN_EXTRACTION_RETRIES) {
        mainAttempt++;
        logIf(input.log, 'info', `Retrying main extraction: ${review.reason ?? 'aborted/timeout'}`);
      } else {
        mainExtractionDone = true;
      }
    }
  }

  let { ratio, missing } = computeCoverage(enriched);
  const COVERAGE_TARGET = 0.7;

  // Phase 2: targeted extraction for missing fields when coverage < 70%
  if (
    ratio < COVERAGE_TARGET &&
    missing.length > 0 &&
    withinBudget() &&
    combinedText.length > 100
  ) {
    logIf(
      input.log,
      'info',
      `Core coverage ${(ratio * 100).toFixed(0)}% < 70%; running targeted extraction for: ${missing.join(', ')}`,
    );
    let targetedAttempt = 0;
    const maxTargetedRetries = 1;
    let targetedDone = false;

    while (withinBudget() && !targetedDone && targetedAttempt <= maxTargetedRetries) {
      try {
        const fieldHints: Record<string, string> = {
          descriptionText: '3-5 sentence company overview and mission',
          longCompanyDescription: 'longer paragraph description of company',
          industries: 'array of industry labels e.g. ["Biotech","SaaS"]',
          headquartersAndOffices: 'City, Country | City, Country for HQs and offices',
          companyStage: 'e.g. startup, growth, enterprise',
          sizeRange: 'employee count band e.g. "51-200"',
          foundedYear: 'numeric year founded',
          careersPageUrl: 'URL of careers/jobs page',
          linkedInCompanyUrl: 'LinkedIn company page URL',
          remotePolicy: 'on-site/remote/hybrid policy',
          remoteFriendlyLocations: 'array of regions/countries for remote',
          sponsorshipSignals: 'object with H1B/visa evidence',
          workAuthorizationRequirements: 'work authorization requirements',
          hiringLocations: 'array of cities/countries where hiring',
          benefitsHighlights: 'benefits summary',
          fundingStage: 'e.g. Seed, Series A, Public',
          publicCompany: 'true/false if publicly traded',
          ticker: 'stock ticker if public',
          missionStatement: 'mission statement text',
          coreValues: 'array of company values',
          typicalHiringProcess: 'hiring process steps',
          interviewProcess: 'interview process description',
          interviewFormatHints: 'array e.g. technical, behavioral',
          applicationTipsFromCareersPage: 'application tips text',
          salaryByLevel: 'object with salary by level',
          techStackHints: 'array of technologies mentioned',
          jobCountOpen: 'approximate open job count',
          hiringTrend: 'growing, stable, or contracting',
          recentLayoffsOrRestructuring: 'layoffs or restructuring note',
        };
        const missingDesc = missing.map((f) => `- ${f}: ${fieldHints[f] ?? f}`).join('\n');
        // Retry with smaller context to avoid timeout
        const textCap = targetedAttempt === 0 ? 50000 : 25000;
        const timeoutMs = targetedAttempt === 0 ? 180_000 : 300_000;
        const targetedPrompt = `Company: ${input.companyName}

From the text below, extract ONLY these missing fields. Return a JSON object with ONLY these keys (use null if not found):
${missingDesc}

TEXT:
${combinedText.slice(0, textCap)}

Return only the JSON object.`;

        if (targetedAttempt > 0) {
          logIf(
            input.log,
            'info',
            `Targeted extraction retry ${targetedAttempt} (smaller context, longer timeout)...`,
          );
        }
        const targetedResponse = await complete(targetedPrompt, 'GENERAL', {
          format: 'json',
          temperature: 0.1,
          maxTokens: 512,
          timeout: Math.min(timeoutMs, hardTimeout - (Date.now() - start)),
        });
        let targetedParsed: any;
        try {
          targetedParsed = JSON.parse(targetedResponse);
        } catch {
          targetedParsed = {};
        }
        if (targetedParsed && typeof targetedParsed === 'object') {
          if (missing.includes('descriptionText') && targetedParsed.descriptionText)
            enriched.descriptionText = String(targetedParsed.descriptionText);
          if (missing.includes('longCompanyDescription') && targetedParsed.longCompanyDescription)
            enriched.longCompanyDescription = String(targetedParsed.longCompanyDescription);
          if (missing.includes('industries') && Array.isArray(targetedParsed.industries))
            enriched.industries = targetedParsed.industries
              .map((x: unknown) => String(x))
              .slice(0, 10);
          if (missing.includes('headquartersAndOffices') && targetedParsed.headquartersAndOffices)
            enriched.headquartersAndOffices = String(targetedParsed.headquartersAndOffices);
          if (missing.includes('companyStage') && targetedParsed.companyStage)
            enriched.companyStage = String(targetedParsed.companyStage);
          if (missing.includes('sizeRange') && targetedParsed.sizeRange)
            enriched.sizeRange = String(targetedParsed.sizeRange);
          if (missing.includes('foundedYear') && targetedParsed.foundedYear != null)
            enriched.foundedYear = Number(targetedParsed.foundedYear) || null;
          if (missing.includes('careersPageUrl') && targetedParsed.careersPageUrl)
            enriched.careersPageUrl = String(targetedParsed.careersPageUrl);
          if (missing.includes('linkedInCompanyUrl') && targetedParsed.linkedInCompanyUrl)
            enriched.linkedInCompanyUrl = String(targetedParsed.linkedInCompanyUrl);
          if (missing.includes('remotePolicy') && targetedParsed.remotePolicy)
            enriched.remotePolicy = String(targetedParsed.remotePolicy);
          if (
            missing.includes('remoteFriendlyLocations') &&
            Array.isArray(targetedParsed.remoteFriendlyLocations)
          )
            enriched.remoteFriendlyLocations = targetedParsed.remoteFriendlyLocations
              .map((x: unknown) => String(x))
              .slice(0, 15);
          if (
            missing.includes('sponsorshipSignals') &&
            targetedParsed.sponsorshipSignals &&
            typeof targetedParsed.sponsorshipSignals === 'object'
          )
            enriched.sponsorshipSignals = targetedParsed.sponsorshipSignals;
          if (
            missing.includes('workAuthorizationRequirements') &&
            targetedParsed.workAuthorizationRequirements
          )
            enriched.workAuthorizationRequirements = String(
              targetedParsed.workAuthorizationRequirements,
            );
          if (missing.includes('hiringLocations') && Array.isArray(targetedParsed.hiringLocations))
            enriched.hiringLocations = targetedParsed.hiringLocations
              .map((x: unknown) => String(x))
              .slice(0, 20);
          if (missing.includes('benefitsHighlights') && targetedParsed.benefitsHighlights)
            enriched.benefitsHighlights = String(targetedParsed.benefitsHighlights);
          if (missing.includes('fundingStage') && targetedParsed.fundingStage)
            enriched.fundingStage = String(targetedParsed.fundingStage);
          if (
            missing.includes('publicCompany') &&
            typeof targetedParsed.publicCompany === 'boolean'
          )
            enriched.publicCompany = targetedParsed.publicCompany;
          if (missing.includes('ticker') && targetedParsed.ticker)
            enriched.ticker = String(targetedParsed.ticker);
          if (missing.includes('missionStatement') && targetedParsed.missionStatement)
            enriched.missionStatement = String(targetedParsed.missionStatement);
          if (missing.includes('coreValues') && Array.isArray(targetedParsed.coreValues))
            enriched.coreValues = targetedParsed.coreValues
              .map((x: unknown) => String(x))
              .slice(0, 10);
          if (missing.includes('typicalHiringProcess') && targetedParsed.typicalHiringProcess)
            enriched.typicalHiringProcess = String(targetedParsed.typicalHiringProcess);
          if (missing.includes('interviewProcess') && targetedParsed.interviewProcess)
            enriched.interviewProcess = String(targetedParsed.interviewProcess);
          if (
            missing.includes('interviewFormatHints') &&
            Array.isArray(targetedParsed.interviewFormatHints)
          )
            enriched.interviewFormatHints = targetedParsed.interviewFormatHints
              .map((x: unknown) => String(x))
              .slice(0, 10);
          if (
            missing.includes('applicationTipsFromCareersPage') &&
            targetedParsed.applicationTipsFromCareersPage
          )
            enriched.applicationTipsFromCareersPage = String(
              targetedParsed.applicationTipsFromCareersPage,
            );
          if (
            missing.includes('salaryByLevel') &&
            targetedParsed.salaryByLevel &&
            typeof targetedParsed.salaryByLevel === 'object'
          )
            enriched.salaryByLevel = targetedParsed.salaryByLevel as Record<string, unknown>;
          if (missing.includes('techStackHints') && Array.isArray(targetedParsed.techStackHints))
            enriched.techStackHints = targetedParsed.techStackHints
              .map((x: unknown) => String(x))
              .slice(0, 30);
          if (missing.includes('jobCountOpen') && targetedParsed.jobCountOpen != null)
            enriched.jobCountOpen = Number(targetedParsed.jobCountOpen) || null;
          if (missing.includes('hiringTrend') && targetedParsed.hiringTrend)
            enriched.hiringTrend = String(targetedParsed.hiringTrend);
          if (
            missing.includes('recentLayoffsOrRestructuring') &&
            targetedParsed.recentLayoffsOrRestructuring
          )
            enriched.recentLayoffsOrRestructuring = String(
              targetedParsed.recentLayoffsOrRestructuring,
            );
        }
        const after = computeCoverage(enriched);
        ratio = after.ratio;
        missing = after.missing;
        logIf(
          input.log,
          'info',
          `Targeted pass complete. Core coverage now ${(ratio * 100).toFixed(0)}%.`,
        );
        targetedDone = true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logIf(input.log, 'warn', `Targeted extraction failed: ${errMsg}`);
        const review = shouldRetry({
          action: 'llm_targeted_extraction',
          context: {
            errorMessage: errMsg,
            attempt: targetedAttempt,
            maxRetries: maxTargetedRetries,
          },
        });
        if (review.shouldRetry && targetedAttempt < maxTargetedRetries) {
          targetedAttempt++;
          logIf(
            input.log,
            'info',
            `Retrying targeted extraction: ${review.reason ?? 'aborted/timeout'}`,
          );
        } else {
          targetedDone = true;
        }
      }
    }
  }

  enriched.coreFieldCoverage = ratio;
  enriched.missingCoreFields = missing;

  logIf(
    input.log,
    'info',
    `Deep company enrichment complete. Core coverage=${(ratio * 100).toFixed(
      0,
    )}% (missing: ${missing.join(', ') || 'none'})`,
  );

  return enriched;
}

const COVERAGE_TARGET_DOSSIER = 0.7;

async function runDossierPipeline(
  input: DeepCompanyResearchInput,
): Promise<DeepCompanyEnrichmentDraft> {
  const start = Date.now();
  const hardTimeout = input.hardTimeoutMs ?? 900_000; // 15 min default for full pipeline
  const runFolderName = input.runFolderName!;
  const writer = input.dossierWriter!;
  const runCompanyPageRag = input.runCompanyPageRag!;

  function withinBudget(): boolean {
    return Date.now() - start < hardTimeout;
  }

  const onLog = (msg: string) => input.log?.({ level: 'info', message: msg });

  await writer.ensureRunFolder(runFolderName);
  await writer.saveMetadata(runFolderName, {
    companyName: input.companyName,
    seedUrl: input.seedUrl ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    finalCoverage: null,
    finalStatus: null,
  });

  let memory = createEmptyDossierMemory();
  memory = { ...memory, urlsToVisit: [] };
  await writer.writeMemory(runFolderName, memory);

  const domainFromSeed = extractDomainFromUrl(input.seedUrl ?? undefined);
  let primaryHost: string | null = domainFromSeed;
  if (primaryHost && isLikelyAtsHost(primaryHost)) {
    const slug = companySlugFromName(input.companyName);
    if (slug) primaryHost = `${slug}.com`;
  }
  if (!primaryHost) {
    const slug = companySlugFromName(input.companyName);
    if (slug) primaryHost = `${slug}.com`;
  }

  const visitedSet = new Set<string>();
  let suggestedQueries: string[] | null = null;
  let suggestedUrls: string[] | null = null;
  let orchestratorIterations = 0;
  const maxOrchestratorRounds = 15;
  /** Prevent infinite loops when search extraction returns zero URLs repeatedly. */
  let consecutiveZeroUrlRounds = 0;
  const companySlug = companySlugFromName(input.companyName) ?? '';

  while (withinBudget() && orchestratorIterations < maxOrchestratorRounds) {
    orchestratorIterations++;
    const visitedBeforeRound = visitedSet.size;

    // When browser is used, never fetch orchestrator-suggested URLs directly; convert them to search queries so we only visit URLs that come from real search.
    if (input.browserPage && suggestedUrls?.length) {
      suggestedQueries = [
        ...(suggestedQueries ?? []),
        ...urlsToSearchQueries(suggestedUrls, input.companyName),
      ];
      suggestedUrls = null;
    }

    let urlsToFetch: { url: string }[] = [];

    // Prefer orchestrator suggestions while must-have fields are still missing AND we haven't
    // exceeded the per-field attempt budget; once all must-have attempts are exhausted, or all
    // must-have fields are filled, rely on deterministic fallback targeting for should-have
    // and nice-to-have fields.
    const attemptsByField = memory.targetedAttemptsByField ?? {};
    const missingMustHave = memory.coverage.missing.filter((f) =>
      FIELD_PRIORITY_MUST_HAVE.includes(f as (typeof FIELD_PRIORITY_MUST_HAVE)[number]),
    );
    const remainingMustHave = missingMustHave.filter(
      (f) => (attemptsByField[f] ?? 0) < 2, // allow at most 2 targeted attempts per must-have field
    );

    if (suggestedUrls?.length) {
      urlsToFetch = suggestedUrls
        .filter((u) => !visitedSet.has(normalizeUrlForDedupe(u)) && !isJunkUrl(u))
        .map((url) => ({ url }));
      suggestedUrls = null;
    } else if (suggestedQueries?.length && remainingMustHave.length > 0) {
      const companyLower = input.companyName.toLowerCase();
      for (const raw of suggestedQueries) {
        if (!withinBudget()) break;
        const q = typeof raw === 'string' ? raw.trim() : String(raw).trim();
        let effectiveQuery = q;

        // If orchestrator returned a bare field name, map it to a richer query using our label map,
        // and track that as an attempt for that specific field.
        let fieldNameForAttempt: CoreField | null = null;
        if (CORE_FIELDS.includes(q as CoreField)) {
          fieldNameForAttempt = q as CoreField;
          const mapped = targetedQueriesForMissingFields(
            [fieldNameForAttempt],
            input.companyName,
          )[0];
          effectiveQuery = mapped ?? `${input.companyName} ${q}`;
        } else if (!q.toLowerCase().includes(companyLower)) {
          // Ensure every query includes the company name.
          effectiveQuery = `${input.companyName} ${q}`;
        }

        const triedSet = new Set(memory.targetedQueriesTried ?? []);
        if (triedSet.has(effectiveQuery)) {
          logIf(
            input.log,
            'info',
            `Skipping targeted search "${effectiveQuery}" (already tried in this run).`,
          );
          continue;
        }

        const results = input.browserPage
          ? await searchWebViaBrowser(input.browserPage, effectiveQuery)
          : isSearchConfigured()
            ? await searchWeb(effectiveQuery, { num: 5 })
            : [];

        // Select the first good candidate (title contains company name when browser is used),
        // skipping junk URLs, visited URLs, and failed URLs.
        const failedSet = new Set(memory.failedUrls ?? []);
        const rawCandidates = input.browserPage
          ? results.filter((r) => resultTitleMatchesCompany(r.title, input.companyName))
          : results;
        const firstGood = rawCandidates.find((r) => {
          if (isJunkUrl(r.url)) return false;
          const key = normalizeUrlForDedupe(r.url);
          if (visitedSet.has(key)) return false;
          if (failedSet.has(r.url)) return false;
          return true;
        });

        const toAdd = firstGood ? [firstGood] : [];
        logIf(
          input.log,
          'info',
          `Targeted search: "${effectiveQuery}" — ${toAdd.length} URLs extracted`,
        );
        // Track targeted queries we've tried.
        const tried = new Set(memory.targetedQueriesTried ?? []);
        tried.add(effectiveQuery);
        const attemptsByFieldNext = { ...(memory.targetedAttemptsByField ?? {}) };
        if (fieldNameForAttempt) {
          attemptsByFieldNext[fieldNameForAttempt] =
            (attemptsByFieldNext[fieldNameForAttempt] ?? 0) + 1;
        }
        memory = {
          ...memory,
          targetedQueriesTried: Array.from(tried),
          targetedAttemptsByField: attemptsByFieldNext,
        };
        await writer.writeMemory(runFolderName, memory);

        for (const r of toAdd) {
          const key = normalizeUrlForDedupe(r.url);
          if (!visitedSet.has(key)) urlsToFetch.push({ url: r.url });
        }
      }
      suggestedQueries = null;
    } else if (memory.visitedUrls.length === 0) {
      const onAfterSearch = async (
        _query: string,
        _extractedCount: number,
        urlsToVisit: string[],
      ) => {
        memory = { ...memory, urlsToVisit, discoveredUrls: urlsToVisit };
        await writer.writeMemory(runFolderName, memory);
      };

      const searchResults = input.browserPage
        ? await discoverUrlsViaBrowser(
            input.companyName,
            input.browserPage,
            input.log,
            withinBudget,
            { onAfterSearch },
          )
        : await discoverUrlsViaSearch(input.companyName, input.log, withinBudget);

      const urlsFromDiscovery = input.browserPage
        ? (memory.urlsToVisit ?? searchResults.map((r) => r.url))
        : searchResults.map((r) => r.url);

      memory = { ...memory, discoveredUrls: urlsFromDiscovery, urlsToVisit: urlsFromDiscovery };
      await writer.writeMemory(runFolderName, memory);

      // Initial discovery: visit at most 2 URLs in the first batch so we can start extracting quickly.
      const initialUnvisited = urlsFromDiscovery.filter(
        (u) => !visitedSet.has(normalizeUrlForDedupe(u)),
      );
      const initialBatch = initialUnvisited.slice(0, 2);
      for (const url of initialBatch) urlsToFetch.push({ url });
      // Only use fallback when we have no browser (e.g. SerpAPI-only) and search returned nothing.
      if (urlsToFetch.length === 0 && primaryHost && !input.browserPage && withinBudget()) {
        for (const url of getFallbackUrls(primaryHost)) urlsToFetch.push({ url });
      }
    } else if (memory.urlsToVisit?.length) {
      // Continue initial discovered URLs in small batches so we can interleave with targeted work.
      const unvisited = memory.urlsToVisit.filter((u) => !visitedSet.has(normalizeUrlForDedupe(u)));
      const batch = unvisited.slice(0, 2);
      for (const url of batch) urlsToFetch.push({ url });
      if (unvisited.length > 0) {
        logIf(input.log, 'info', `Continuing initial URLs: ${unvisited.length} remaining to visit`);
      }
    } else if (
      input.browserPage &&
      memory.urlsToVisit?.length &&
      memory.coverage.missing.length > 0 &&
      !(memory.urlsToVisitMissingFields && memory.urlsToVisitMissingFields.length > 0) &&
      memory.urlsToVisit.every((u) => visitedSet.has(normalizeUrlForDedupe(u)))
    ) {
      // Fallback: browser search per missing field (must-have/should-have/nice-to-have), but only add a small batch
      // of URLs (up to 2) per round so we can start visiting them quickly.
      logIf(
        input.log,
        'info',
        `Initial URLs done. Running fallback search for missing fields: ${memory.coverage.missing.join(', ')}`,
      );
      const fallbackUrls: string[] = [];
      for (const field of memory.coverage.missing) {
        if (!withinBudget()) break;
        if (fallbackUrls.length >= 2) break;
        // Respect per-field attempt budget: at most 2 targeted attempts per field.
        const attempts = (memory.targetedAttemptsByField ?? {})[field] ?? 0;
        if (attempts >= 2) continue;
        const queries = targetedQueriesForMissingFields([field], input.companyName);
        const query = queries[0] ?? `${input.companyName} ${field}`;
        logIf(input.log, 'info', `Fallback search: "${query}"`);
        const results = await searchWebViaBrowser(input.browserPage!, query);

        const failedSet = new Set(memory.failedUrls ?? []);
        const rawCandidates = results.filter((r) =>
          resultTitleMatchesCompany(r.title, input.companyName),
        );
        const firstGood = rawCandidates.find((r) => {
          if (isJunkUrl(r.url)) return false;
          const key = normalizeUrlForDedupe(r.url);
          if (visitedSet.has(key)) return false;
          if (failedSet.has(r.url)) return false;
          return true;
        });

        if (firstGood) {
          fallbackUrls.push(firstGood.url);
          logIf(
            input.log,
            'info',
            `Fallback search: "${query}" — 1 link extracted (saved to urlsToVisitMissingFields)`,
          );
        } else {
          logIf(input.log, 'info', `Fallback search: "${query}"`);
        }
        if (memory.coverage.missing.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, FALLBACK_SEARCH_DELAY_MS));
        }
      }
      const existingFallback = memory.urlsToVisitMissingFields ?? [];
      const triedQueries = new Set(memory.targetedQueriesTried ?? []);
      const attemptsByFieldNext = { ...(memory.targetedAttemptsByField ?? {}) };
      for (const url of fallbackUrls) {
        // We don't know which specific field each URL was for in this batch without extra tracking,
        // so we conservatively mark a generic "fallback" attempt in targetedQueriesTried.
      }
      triedQueries.add(
        memory.coverage.missing.length > 0
          ? `fallback: ${memory.coverage.missing.join(', ')}`
          : 'fallback',
      );
      memory = {
        ...memory,
        urlsToVisitMissingFields: [...existingFallback, ...fallbackUrls],
        targetedQueriesTried: Array.from(triedQueries),
        targetedAttemptsByField: attemptsByFieldNext,
      };
      await writer.writeMemory(runFolderName, memory);
      for (const url of fallbackUrls) {
        const key = normalizeUrlForDedupe(url);
        if (!visitedSet.has(key)) urlsToFetch.push({ url });
      }
    } else if (memory.urlsToVisitMissingFields?.length) {
      // Still have fallback URLs to visit (e.g. from a previous round).
      for (const url of memory.urlsToVisitMissingFields) {
        const key = normalizeUrlForDedupe(url);
        if (!visitedSet.has(key)) urlsToFetch.push({ url });
      }
    }

    for (const { url } of urlsToFetch) {
      if (!withinBudget()) break;
      const norm = normalizeUrlForDedupe(url);
      if (visitedSet.has(norm)) continue;

      logIf(input.log, 'info', `Fetching: ${url}`);
      const html = await fetchUrlWithRetry(url, {
        timeoutMs: 14_000,
        minChars: 500,
        log: input.log,
        browserPage: input.browserPage ?? null,
        withinBudget,
        action: 'fetch_url',
      });
      if (!html || html.length < 500) {
        const failedSet = new Set(memory.failedUrls ?? []);
        failedSet.add(url);
        memory = { ...memory, failedUrls: Array.from(failedSet) };
        await writer.writeMemory(runFolderName, memory);
        continue;
      }

      visitedSet.add(norm);
      // Heuristic fills from URL patterns (careers page, LinkedIn company page) so we don't waste
      // time repeatedly searching for fields when we already have a high-confidence URL.
      try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        const path = u.pathname.toLowerCase();

        let heuristicExtraction: DossierPageExtraction | null = null;

        const hasCareers =
          hasValueForCoverage(memory.fields.careersPageUrl?.value, 'careersPageUrl') === true;
        const hasLinkedIn =
          hasValueForCoverage(memory.fields.linkedInCompanyUrl?.value, 'linkedInCompanyUrl') ===
          true;

        // Careers page URL: same primary host (or slug host) and path containing "careers" or "jobs".
        if (!hasCareers && primaryHost && host.includes(primaryHost.replace(/^www\./, ''))) {
          if (path.includes('careers') || path.includes('/jobs')) {
            heuristicExtraction = {
              ...(heuristicExtraction ?? {}),
              careersPageUrl: url,
            };
          }
        }

        // LinkedIn company URL: linkedin.com/company/...
        if (!hasLinkedIn && host.includes('linkedin.com') && path.includes('/company/')) {
          heuristicExtraction = {
            ...(heuristicExtraction ?? {}),
            linkedInCompanyUrl: url,
          };
        }

        if (heuristicExtraction) {
          memory = mergeExtractionIntoMemory(memory, heuristicExtraction, url);
          await writer.writeMemory(runFolderName, memory);
          logIf(
            input.log,
            'info',
            `Heuristic fill from URL: updated fields [${Object.keys(heuristicExtraction).join(
              ', ',
            )}]`,
          );
        }
      } catch {
        // ignore URL parsing issues
      }

      const slug = urlToDossierSlug(url, memory.visitedUrls.length);
      const cleaned = cleanHtml(html);
      await writer.writePageRawAndCleaned(runFolderName, slug, html, cleaned.html);

      const pageDir = writer.getPageDir(runFolderName, slug);
      const ragResult = await runCompanyPageRag(pageDir, cleaned.html, onLog);
      const contentForExtract = ragResult.focusedHtml ?? cleaned.html;

      const extraction = await extractFromSinglePage(
        contentForExtract,
        input.companyName,
        input.log,
        hardTimeout - (Date.now() - start),
      );
      if (extraction) {
        memory = mergeExtractionIntoMemory(memory, extraction, url);
        await writer.writeMemory(runFolderName, memory);
        logIf(
          input.log,
          'info',
          `Memory updated. Coverage ${(memory.coverage.ratio * 100).toFixed(0)}%`,
        );
      }
    }

    const madeProgressThisRound = visitedSet.size > visitedBeforeRound;
    if (!madeProgressThisRound && urlsToFetch.length === 0) consecutiveZeroUrlRounds++;
    else consecutiveZeroUrlRounds = 0;

    if (consecutiveZeroUrlRounds >= 3 && memory.visitedUrls.length === 0) {
      logIf(
        input.log,
        'warn',
        'No URLs could be extracted from DuckDuckGo searches (3 rounds). Finalizing early; check DDG selectors/redirect handling.',
      );
      break;
    }

    // Finalization rules: prefer higher coverage (core >= 80%, total >= 70%) and ensure we've tried
    // targeted URLs for missing fields where possible, or stop when budget is exhausted.
    const allInitialVisited =
      !memory.urlsToVisit?.length ||
      memory.urlsToVisit.every((u) => visitedSet.has(normalizeUrlForDedupe(u)));
    const allFallbackVisited =
      !!memory.urlsToVisitMissingFields?.length &&
      memory.urlsToVisitMissingFields.every((u) => visitedSet.has(normalizeUrlForDedupe(u)));

    if (allInitialVisited && memory.coverage.ratio >= 0.8 && memory.coverage.missing.length === 0) {
      logIf(input.log, 'info', `Core coverage >= 80% and no missing fields. Finalizing.`);
      break;
    }

    if (allFallbackVisited) {
      logIf(
        input.log,
        'info',
        `All fallback URLs visited. Coverage ${(memory.coverage.ratio * 100).toFixed(0)}%. Finalizing.`,
      );
      break;
    }

    const orch = await runOrchestratorStep(memory, input.companyName, input.log);
    if (orch.action === 'finalize' || (!orch.nextQueries?.length && !orch.nextUrls?.length)) {
      logIf(input.log, 'info', orch.reason ?? 'Orchestrator finalize.');
      break;
    }
    suggestedQueries = orch.nextQueries ?? null;
    suggestedUrls = orch.nextUrls ?? null;

    // When browser is used, never use orchestrator-provided URLs directly; we'll convert them to queries at the top of the next iteration.
  }

  const draft = await runFinalSynthesis(memory, input, primaryHost);
  await writer.saveMetadata(runFolderName, {
    companyName: input.companyName,
    seedUrl: input.seedUrl ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    finalCoverage: draft.coreFieldCoverage,
    finalStatus: draft.coreFieldCoverage >= COVERAGE_TARGET_DOSSIER ? 'DONE' : 'PARTIAL',
  });

  return draft;
}

async function extractFromSinglePage(
  htmlOrText: string,
  companyName: string,
  log: DeepCompanyResearchInput['log'],
  timeoutMs: number,
): Promise<DossierPageExtraction | null> {
  const text = textFromHtml(htmlOrText, 25000);
  if (text.length < 100) return null;

  const m = FIELD_PRIORITY_TIERS.mustHave.join(', ');
  const s = FIELD_PRIORITY_TIERS.shouldHave.join(', ');
  const n = FIELD_PRIORITY_TIERS.niceToHave.join(', ');

  const prompt = `You are extracting company information from a single web page.

Company name: ${companyName}

Scrape and fill fields in this priority order (must-have first, then should-have, then nice-to-have). Use null for any field not found.

Priority:
- Must-have (fill these first): ${m}
- Should-have (then these): ${s}
- Nice-to-have (then these): ${n}

From the text below (from one page only), extract as many of the above fields as you can. Return a single JSON object with only these keys (null if not found):
${[
  ...FIELD_PRIORITY_TIERS.mustHave,
  ...FIELD_PRIORITY_TIERS.shouldHave,
  ...FIELD_PRIORITY_TIERS.niceToHave,
].join(', ')}

TEXT:
${text.slice(0, 20000)}

Return only the JSON object.`;

  try {
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 1024,
      timeout: Math.min(120_000, timeoutMs),
    });
    const parsed = JSON.parse(response) as DossierPageExtraction;
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

async function runOrchestratorStep(
  memory: DossierMemory,
  companyName: string,
  log: DeepCompanyResearchInput['log'],
): Promise<{
  action: 'continue' | 'finalize';
  nextQueries?: string[];
  nextUrls?: string[];
  reason?: string;
}> {
  const missing = memory.coverage.missing;
  const missingStr = missing.join(', ') || 'none';
  const mustHaveSet = new Set(FIELD_PRIORITY_MUST_HAVE);
  const missingMustHave = missing.filter((f) =>
    mustHaveSet.has(f as (typeof FIELD_PRIORITY_MUST_HAVE)[number]),
  );
  const tiers =
    memory.fieldPriorityTiers &&
    `Priority order for missing fields: must-have first (${memory.fieldPriorityTiers.mustHave.join(', ')}), then should-have, then nice-to-have. You MUST prefer search queries that target missing must-have fields first.`;

  const triedQueries = memory.targetedQueriesTried ?? [];
  const failedUrls = memory.failedUrls ?? [];
  const triedSummary =
    triedQueries.length > 0
      ? `Targeted queries already tried (you MUST NOT output these exact strings again; if you want to revisit a concept, significantly change the wording or target a different angle/page): ${triedQueries.join('; ')}`
      : 'No targeted queries have been tried yet.';
  const failedSummary =
    failedUrls.length > 0
      ? `URLs that failed or returned empty content (avoid revisiting these): ${failedUrls.join('; ')}`
      : 'No failed URLs recorded yet.';

  const prompt = `You are the orchestrator for a company research run.

Company: ${companyName}
Current coverage: ${(memory.coverage.ratio * 100).toFixed(0)}% (target 70%).
Missing fields (in priority order): ${missingStr}
${tiers ? tiers + '\n' : ''}
${triedSummary}
${failedSummary}
STRICT RULE: You must NOT return action "finalize" if any must-have field is still missing. Must-have fields are: ${FIELD_PRIORITY_MUST_HAVE.join(', ')}. Only return "finalize" when all must-have fields are filled OR all fallback URLs for missing fields have been visited (the pipeline will tell you). If any must-have is in the missing list, return "continue" with nextQueries targeting those must-have fields first.

Visited URLs: ${memory.visitedUrls.length}

Decide the next action:
1. If any must-have field is still missing, return action "continue" with nextQueries targeting missing must-have fields first.
2. Otherwise, if we can still improve, return action "continue" and provide nextQueries and/or nextUrls.
3. Only if we are done or exhausted (and no must-have missing), return action "finalize" with a short reason.

Return ONLY a JSON object:
{ "action": "continue" | "finalize", "nextQueries": string[] | null, "nextUrls": string[] | null, "reason": string | null }`;

  try {
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.2,
      maxTokens: 512,
      timeout: 180_000, // 3 min so Ollama can finish loading the 32B model if needed
    });
    const raw = typeof response === 'string' ? response.trim() : String(response);
    const jsonStr = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, '$1');
    const parsed = JSON.parse(jsonStr) as {
      action?: string;
      nextQueries?: string[] | null;
      nextUrls?: string[] | null;
      reason?: string | null;
    };
    let action: 'continue' | 'finalize' = parsed.action === 'continue' ? 'continue' : 'finalize';
    let nextQueries = Array.isArray(parsed.nextQueries) ? parsed.nextQueries : undefined;
    let nextUrls = Array.isArray(parsed.nextUrls) ? parsed.nextUrls : undefined;
    let reason = typeof parsed.reason === 'string' ? parsed.reason : undefined;

    // Strict priority: never finalize while any must-have field is still missing.
    if (action === 'finalize' && missingMustHave.length > 0) {
      logIf(
        log,
        'info',
        `Orchestrator returned finalize but must-have fields still missing: ${missingMustHave.join(', ')}. Forcing continue with targeted queries.`,
      );
      action = 'continue';
      nextQueries = targetedQueriesForMissingFields(missingMustHave, companyName).slice(0, 6);
      nextUrls = undefined;
      reason = undefined;
    }

    return {
      action,
      nextQueries,
      nextUrls,
      reason,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logIf(log, 'warn', `Orchestrator step failed: ${msg}`);
    return { action: 'finalize', reason: 'Orchestrator call failed' };
  }
}

async function runFinalSynthesis(
  memory: DossierMemory,
  input: DeepCompanyResearchInput,
  primaryHost: string | null,
): Promise<DeepCompanyEnrichmentDraft> {
  const normalizedName = input.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  const fieldConfidence: Partial<Record<CoreField, number>> = {};
  const draft: DeepCompanyEnrichmentDraft = {
    companyName: input.companyName,
    normalizedName,
    primaryUrl: memory.visitedUrls[0] ?? input.seedUrl ?? null,
    websiteDomain: primaryHost ?? null,
    descriptionText: null,
    longCompanyDescription: null,
    industries: null,
    headquartersAndOffices: null,
    companyStage: null,
    sizeRange: null,
    foundedYear: null,
    careersPageUrl: null,
    linkedInCompanyUrl: null,
    remotePolicy: null,
    remoteFriendlyLocations: null,
    sponsorshipSignals: null,
    workAuthorizationRequirements: null,
    hiringLocations: null,
    benefitsHighlights: null,
    fundingStage: null,
    publicCompany: null,
    ticker: null,
    missionStatement: null,
    coreValues: null,
    typicalHiringProcess: null,
    interviewProcess: null,
    interviewFormatHints: null,
    applicationTipsFromCareersPage: null,
    salaryByLevel: null,
    techStackHints: null,
    jobCountOpen: null,
    hiringTrend: null,
    recentLayoffsOrRestructuring: null,
    jobCountTotal: null,
    visitedUrls: [...memory.visitedUrls],
    coreFieldCoverage: memory.coverage.ratio,
    missingCoreFields: [...memory.coverage.missing],
    fieldConfidence,
  };

  for (const field of CORE_FIELDS) {
    const entry = memory.fields[field];
    if (!entry || entry.value === null || entry.value === undefined) continue;
    const v = entry.value;
    if (field === 'descriptionText') draft.descriptionText = typeof v === 'string' ? v : null;
    else if (field === 'longCompanyDescription')
      draft.longCompanyDescription = typeof v === 'string' ? v : null;
    else if (field === 'industries') draft.industries = Array.isArray(v) ? v.map(String) : null;
    else if (field === 'headquartersAndOffices')
      draft.headquartersAndOffices = typeof v === 'string' ? v : null;
    else if (field === 'companyStage') draft.companyStage = typeof v === 'string' ? v : null;
    else if (field === 'sizeRange') draft.sizeRange = typeof v === 'string' ? v : null;
    else if (field === 'foundedYear') draft.foundedYear = typeof v === 'number' ? v : null;
    else if (field === 'careersPageUrl') draft.careersPageUrl = typeof v === 'string' ? v : null;
    else if (field === 'linkedInCompanyUrl')
      draft.linkedInCompanyUrl = typeof v === 'string' ? v : null;
    else if (field === 'remotePolicy') draft.remotePolicy = typeof v === 'string' ? v : null;
    else if (field === 'remoteFriendlyLocations')
      draft.remoteFriendlyLocations = Array.isArray(v) ? v.map(String) : null;
    else if (field === 'sponsorshipSignals')
      draft.sponsorshipSignals =
        v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    else if (field === 'workAuthorizationRequirements')
      draft.workAuthorizationRequirements = typeof v === 'string' ? v : null;
    else if (field === 'hiringLocations')
      draft.hiringLocations = Array.isArray(v) ? v.map(String) : null;
    else if (field === 'benefitsHighlights')
      draft.benefitsHighlights = typeof v === 'string' ? v : null;
    else if (field === 'fundingStage') draft.fundingStage = typeof v === 'string' ? v : null;
    else if (field === 'publicCompany') draft.publicCompany = typeof v === 'boolean' ? v : null;
    else if (field === 'ticker') draft.ticker = typeof v === 'string' ? v : null;
    else if (field === 'missionStatement')
      draft.missionStatement = typeof v === 'string' ? v : null;
    else if (field === 'coreValues') draft.coreValues = Array.isArray(v) ? v.map(String) : null;
    else if (field === 'typicalHiringProcess')
      draft.typicalHiringProcess = typeof v === 'string' ? v : null;
    else if (field === 'interviewProcess')
      draft.interviewProcess = typeof v === 'string' ? v : null;
    else if (field === 'interviewFormatHints')
      draft.interviewFormatHints = Array.isArray(v) ? v.map(String) : null;
    else if (field === 'applicationTipsFromCareersPage')
      draft.applicationTipsFromCareersPage = typeof v === 'string' ? v : null;
    else if (field === 'salaryByLevel')
      draft.salaryByLevel =
        v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    else if (field === 'techStackHints')
      draft.techStackHints = Array.isArray(v) ? v.map(String) : null;
    else if (field === 'jobCountOpen') draft.jobCountOpen = typeof v === 'number' ? v : null;
    else if (field === 'hiringTrend') draft.hiringTrend = typeof v === 'string' ? v : null;
    else if (field === 'recentLayoffsOrRestructuring')
      draft.recentLayoffsOrRestructuring = typeof v === 'string' ? v : null;
    fieldConfidence[field as CoreField] = entry.confidence;
  }

  // Strict coverage from the draft itself (all CORE_FIELDS) so reported % matches what is actually filled.
  const { ratio, missing } = computeCoverage(draft);
  draft.coreFieldCoverage = ratio;
  draft.missingCoreFields = missing;

  return draft;
}
