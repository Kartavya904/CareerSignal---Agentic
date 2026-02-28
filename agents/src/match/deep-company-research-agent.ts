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

  // Fields that map directly into `companies` enrichment columns
  descriptionText: string | null;
  industries: string[] | null;
  hqLocation: string | null;
  sizeRange: string | null;
  foundedYear: number | null;
  fundingStage: string | null;
  publicCompany: boolean | null;
  ticker: string | null;
  remotePolicy: string | null;
  sponsorshipSignals: Record<string, unknown> | null;
  hiringLocations: string[] | null;
  techStackHints: string[] | null;
  jobCountTotal: number | null;
  jobCountOpen: number | null;

  // Provenance
  visitedUrls: string[];

  // Coverage heuristic over a fixed core field set
  coreFieldCoverage: number;
  missingCoreFields: string[];

  /** Per-field confidence 0–1 from dossier run (when available). */
  fieldConfidence?: Partial<Record<CoreField, number>>;
}

const CORE_FIELDS: (keyof DeepCompanyEnrichmentDraft)[] = [
  'descriptionText',
  'industries',
  'hqLocation',
  'sizeRange',
  'foundedYear',
  'fundingStage',
  'publicCompany',
  'remotePolicy',
  'sponsorshipSignals',
  'hiringLocations',
  'techStackHints',
  'jobCountOpen',
];

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
  (name: string) => `site:reddit.com ${name} company`,
  (name: string) => `${name} careers jobs`,
  (name: string) => `${name} company size employees headquarters`,
  (name: string) => `${name} funding series stock`,
  (name: string) => `${name} H1B visa sponsorship`,
];

const MAX_SEARCH_QUERIES = 8;
const MAX_URLS_TO_FETCH = 22;
/** From each browser search we take only the top N results (real search results, not synthetic). */
const TOP_URLS_PER_SEARCH = 1;
const SEARCH_DELAY_MS = 800;

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

  for (let i = 0; i < Math.min(SEARCH_QUERIES.length, MAX_SEARCH_QUERIES); i++) {
    if (!withinBudget()) break;
    const query = SEARCH_QUERIES[i]!(companyName);
    const prevLength = urlsOrder.length;

    const results = await searchWebViaBrowser(page, query);
    // Only select the first result whose title contains the company name (avoids random top links from DDG).
    const firstMatch = results.find((r) => resultTitleMatchesCompany(r.title, companyName));
    const taken = firstMatch ? [firstMatch] : [];
    for (const r of taken) {
      const key = normalizeUrlForDedupe(r.url);
      if (seen.has(key)) continue;
      seen.set(key, r);
      urlsOrder.push(r.url);
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

/** Generate targeted search queries for missing core fields (e.g. "Airbnb company size employees"). */
function targetedQueriesForMissingFields(missing: string[], companyName: string): string[] {
  const labelMap: Record<string, string> = {
    descriptionText: 'about company',
    industries: 'industries sectors',
    hqLocation: 'headquarters location',
    sizeRange: 'company size employees',
    foundedYear: 'founded year',
    fundingStage: 'funding series stock',
    publicCompany: 'public company stock',
    ticker: 'stock ticker symbol',
    remotePolicy: 'remote work policy',
    sponsorshipSignals: 'H1B visa sponsorship',
    hiringLocations: 'careers hiring locations',
    techStackHints: 'tech stack technologies',
    jobCountOpen: 'open jobs careers',
  };
  return missing.map((f) => `${companyName} ${labelMap[f] ?? f}`).slice(0, 8);
}

function computeCoverage(draft: DeepCompanyEnrichmentDraft): { ratio: number; missing: string[] } {
  let present = 0;
  const missing: string[] = [];

  for (const field of CORE_FIELDS) {
    const value = draft[field];
    const hasValue =
      value !== null &&
      value !== undefined &&
      !(Array.isArray(value) && value.length === 0) &&
      value !== '';
    if (hasValue) present++;
    else missing.push(field);
  }

  const ratio = CORE_FIELDS.length === 0 ? 1 : present / CORE_FIELDS.length;
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
    industries: null,
    hqLocation: null,
    sizeRange: null,
    foundedYear: null,
    fundingStage: null,
    publicCompany: null,
    ticker: null,
    remotePolicy: null,
    sponsorshipSignals: null,
    hiringLocations: null,
    techStackHints: null,
    jobCountTotal: null,
    jobCountOpen: null,
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

Return a single JSON object with exactly these keys:
- descriptionText: 3–5 sentence overview of what the company does and its mission.
- industries: array of high-level industry labels (e.g. ["Biotech", "SaaS"]).
- hqLocation: primary headquarters location (city + country or region).
- sizeRange: descriptive employee count band (e.g. "1-10", "11-50", "51-200", "201-500", "500-1000", "1000+").
- foundedYear: numeric year if obvious, otherwise null.
- fundingStage: short label like "Seed", "Series A", "Series B", "Late-stage", "Public", or null if unclear.
- publicCompany: true if clearly publicly traded, false if clearly private, null if unknown.
- ticker: stock ticker symbol if public and obvious, else null.
- remotePolicy: short description summarizing on-site/remote/hybrid stance.
- sponsorshipSignals: object summarizing any evidence you see about visa/H1B sponsorship or global hiring (keys can include "h1bLikelihood", "countriesMentioned", "remoteLegalNote", etc.). If nothing is mentioned, use an empty object {}.
- hiringLocations: array of location strings where they appear to be hiring.
- techStackHints: array of technologies/frameworks/languages mentioned in careers/engineering pages (e.g. ["Python", "React", "AWS"]).
- jobCountTotal: approximate number of jobs if described, otherwise null.
- jobCountOpen: approximate current open job count if described, otherwise null.

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

      enriched = {
        ...enriched,
        descriptionText: parsed.descriptionText ? String(parsed.descriptionText) : null,
        industries,
        hqLocation: parsed.hqLocation ? String(parsed.hqLocation) : null,
        sizeRange: parsed.sizeRange ? String(parsed.sizeRange) : null,
        foundedYear:
          typeof parsed.foundedYear === 'number'
            ? parsed.foundedYear
            : parsed.foundedYear && !Number.isNaN(Number(parsed.foundedYear))
              ? Number(parsed.foundedYear)
              : null,
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
        remotePolicy: parsed.remotePolicy ? String(parsed.remotePolicy) : null,
        sponsorshipSignals:
          parsed.sponsorshipSignals && typeof parsed.sponsorshipSignals === 'object'
            ? parsed.sponsorshipSignals
            : {},
        hiringLocations,
        techStackHints,
        jobCountTotal:
          typeof parsed.jobCountTotal === 'number'
            ? parsed.jobCountTotal
            : parsed.jobCountTotal && !Number.isNaN(Number(parsed.jobCountTotal))
              ? Number(parsed.jobCountTotal)
              : null,
        jobCountOpen:
          typeof parsed.jobCountOpen === 'number'
            ? parsed.jobCountOpen
            : parsed.jobCountOpen && !Number.isNaN(Number(parsed.jobCountOpen))
              ? Number(parsed.jobCountOpen)
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
          industries: 'array of industry labels e.g. ["Biotech","SaaS"]',
          hqLocation: 'headquarters city and country or region',
          sizeRange: 'employee count band e.g. "51-200" or "1000+"',
          foundedYear: 'numeric year founded',
          fundingStage: 'e.g. Seed, Series A, Public',
          publicCompany: 'true/false if publicly traded',
          ticker: 'stock ticker if public',
          remotePolicy: 'on-site/remote/hybrid policy',
          sponsorshipSignals: 'object with H1B/visa/global hiring evidence',
          hiringLocations: 'array of cities/countries where hiring',
          techStackHints: 'array of technologies mentioned',
          jobCountOpen: 'approximate open job count',
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
          if (missing.includes('industries') && Array.isArray(targetedParsed.industries))
            enriched.industries = targetedParsed.industries
              .map((x: unknown) => String(x))
              .slice(0, 10);
          if (missing.includes('hqLocation') && targetedParsed.hqLocation)
            enriched.hqLocation = String(targetedParsed.hqLocation);
          if (missing.includes('sizeRange') && targetedParsed.sizeRange)
            enriched.sizeRange = String(targetedParsed.sizeRange);
          if (missing.includes('foundedYear') && targetedParsed.foundedYear != null)
            enriched.foundedYear = Number(targetedParsed.foundedYear) || null;
          if (missing.includes('fundingStage') && targetedParsed.fundingStage)
            enriched.fundingStage = String(targetedParsed.fundingStage);
          if (
            missing.includes('publicCompany') &&
            typeof targetedParsed.publicCompany === 'boolean'
          )
            enriched.publicCompany = targetedParsed.publicCompany;
          if (missing.includes('ticker') && targetedParsed.ticker)
            enriched.ticker = String(targetedParsed.ticker);
          if (missing.includes('remotePolicy') && targetedParsed.remotePolicy)
            enriched.remotePolicy = String(targetedParsed.remotePolicy);
          if (
            missing.includes('sponsorshipSignals') &&
            targetedParsed.sponsorshipSignals &&
            typeof targetedParsed.sponsorshipSignals === 'object'
          )
            enriched.sponsorshipSignals = targetedParsed.sponsorshipSignals;
          if (missing.includes('hiringLocations') && Array.isArray(targetedParsed.hiringLocations))
            enriched.hiringLocations = targetedParsed.hiringLocations
              .map((x: unknown) => String(x))
              .slice(0, 20);
          if (missing.includes('techStackHints') && Array.isArray(targetedParsed.techStackHints))
            enriched.techStackHints = targetedParsed.techStackHints
              .map((x: unknown) => String(x))
              .slice(0, 30);
          if (missing.includes('jobCountOpen') && targetedParsed.jobCountOpen != null)
            enriched.jobCountOpen = Number(targetedParsed.jobCountOpen) || null;
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

    if (suggestedUrls?.length) {
      urlsToFetch = suggestedUrls
        .filter((u) => !visitedSet.has(normalizeUrlForDedupe(u)))
        .map((url) => ({ url }));
      suggestedUrls = null;
    } else if (suggestedQueries?.length) {
      for (const q of suggestedQueries) {
        if (!withinBudget()) break;
        const results = input.browserPage
          ? await searchWebViaBrowser(input.browserPage, q)
          : isSearchConfigured()
            ? await searchWeb(q, { num: 5 })
            : [];
        const firstMatch = input.browserPage
          ? results.find((r) => resultTitleMatchesCompany(r.title, input.companyName))
          : results[0];
        const toAdd = firstMatch ? [firstMatch] : [];
        logIf(input.log, 'info', `Targeted search: "${q}" — ${toAdd.length} URLs extracted`);
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

      for (const url of urlsFromDiscovery) urlsToFetch.push({ url });
      // Only use fallback when we have no browser (e.g. SerpAPI-only) and search returned nothing.
      if (urlsToFetch.length === 0 && primaryHost && !input.browserPage && withinBudget()) {
        for (const url of getFallbackUrls(primaryHost)) urlsToFetch.push({ url });
      }
    } else if (memory.urlsToVisit?.length) {
      // Drain all initial discovered URLs before fallback (may span rounds if we hit timeout).
      const unvisited = memory.urlsToVisit.filter((u) => !visitedSet.has(normalizeUrlForDedupe(u)));
      for (const url of unvisited) urlsToFetch.push({ url });
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
      // Fallback: one browser search per missing field, exactly one URL per search (title must contain company name).
      logIf(
        input.log,
        'info',
        `Initial URLs done. Running fallback search for missing fields: ${memory.coverage.missing.join(', ')}`,
      );
      const fallbackUrls: string[] = [];
      for (const field of memory.coverage.missing) {
        if (!withinBudget()) break;
        const queries = targetedQueriesForMissingFields([field], input.companyName);
        const query = queries[0] ?? `${input.companyName} ${field}`;
        logIf(input.log, 'info', `Fallback search: "${query}"`);
        const results = await searchWebViaBrowser(input.browserPage!, query);
        const first = results.find((r) => resultTitleMatchesCompany(r.title, input.companyName));
        if (first) {
          fallbackUrls.push(first.url);
          logIf(
            input.log,
            'info',
            `Fallback search: "${query}" — 1 link extracted (saved to urlsToVisitMissingFields)`,
          );
        } else {
          logIf(input.log, 'info', `Fallback search: "${query}"`);
        }
        if (memory.coverage.missing.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS));
        }
      }
      memory = { ...memory, urlsToVisitMissingFields: fallbackUrls };
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
      if (!html || html.length < 500) continue;

      visitedSet.add(norm);
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

    // Only finalize at 70% when we've visited all initial URLs (goal: drain discovered first, then 70%).
    const allInitialVisited =
      !memory.urlsToVisit?.length ||
      memory.urlsToVisit.every((u) => visitedSet.has(normalizeUrlForDedupe(u)));
    if (
      memory.coverage.ratio >= COVERAGE_TARGET_DOSSIER &&
      memory.coverage.missing.length === 0 &&
      allInitialVisited
    ) {
      logIf(input.log, 'info', `Coverage >= 70% and no missing fields. Finalizing.`);
      break;
    }

    // After visiting all fallback URLs (urlsToVisitMissingFields), finalize (we're done with the run).
    if (
      memory.urlsToVisitMissingFields?.length &&
      memory.urlsToVisitMissingFields.every((u) => visitedSet.has(normalizeUrlForDedupe(u)))
    ) {
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

  const prompt = `You are extracting company information from a single web page.

Company name: ${companyName}

From the text below (from one page only), extract as many of these fields as you can. Use null if not found.

Return a single JSON object with only these keys:
- descriptionText: string or null
- industries: array of strings or null
- hqLocation: string or null
- sizeRange: string or null
- foundedYear: number or null
- fundingStage: string or null
- publicCompany: boolean or null
- ticker: string or null
- remotePolicy: string or null
- sponsorshipSignals: object or null
- hiringLocations: array of strings or null
- techStackHints: array of strings or null
- jobCountOpen: number or null

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
    return JSON.parse(response) as DossierPageExtraction;
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
  const missing = memory.coverage.missing.join(', ') || 'none';
  const prompt = `You are the orchestrator for a company research run.

Company: ${companyName}
Current coverage: ${(memory.coverage.ratio * 100).toFixed(0)}% (target 70%).
Missing fields: ${missing}
Visited URLs: ${memory.visitedUrls.length}

Decide the next action:
1. If we can still improve, return action "continue" and provide nextQueries (array of search query strings) and/or nextUrls (array of URLs to fetch).
2. If we are done or exhausted, return action "finalize" and a short reason.

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
    return {
      action: parsed.action === 'continue' ? 'continue' : 'finalize',
      nextQueries: Array.isArray(parsed.nextQueries) ? parsed.nextQueries : undefined,
      nextUrls: Array.isArray(parsed.nextUrls) ? parsed.nextUrls : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
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
    industries: null,
    hqLocation: null,
    sizeRange: null,
    foundedYear: null,
    fundingStage: null,
    publicCompany: null,
    ticker: null,
    remotePolicy: null,
    sponsorshipSignals: null,
    hiringLocations: null,
    techStackHints: null,
    jobCountTotal: null,
    jobCountOpen: null,
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
    else if (field === 'industries') draft.industries = Array.isArray(v) ? v.map(String) : null;
    else if (field === 'hqLocation') draft.hqLocation = typeof v === 'string' ? v : null;
    else if (field === 'sizeRange') draft.sizeRange = typeof v === 'string' ? v : null;
    else if (field === 'foundedYear') draft.foundedYear = typeof v === 'number' ? v : null;
    else if (field === 'fundingStage') draft.fundingStage = typeof v === 'string' ? v : null;
    else if (field === 'publicCompany') draft.publicCompany = typeof v === 'boolean' ? v : null;
    else if (field === 'ticker') draft.ticker = typeof v === 'string' ? v : null;
    else if (field === 'remotePolicy') draft.remotePolicy = typeof v === 'string' ? v : null;
    else if (field === 'sponsorshipSignals')
      draft.sponsorshipSignals =
        v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    else if (field === 'hiringLocations')
      draft.hiringLocations = Array.isArray(v) ? v.map(String) : null;
    else if (field === 'techStackHints')
      draft.techStackHints = Array.isArray(v) ? v.map(String) : null;
    else if (field === 'jobCountOpen') draft.jobCountOpen = typeof v === 'number' ? v : null;
    fieldConfidence[field as CoreField] = entry.confidence;
  }

  return draft;
}
