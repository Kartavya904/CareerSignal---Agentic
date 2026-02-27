/**
 * Budgeted crawler for H1B job boards and other RESOURCE/SOURCE rows.
 * Fetches pages (fetch or Playwright), saves raw HTML, extracts jobs via agents,
 * enforces max_pages / max_jobs / timeout_ms from test_budget.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { extractJobsFromHtml, extractLinksFromHtml } from '@careersignal/agents';
import type { RawJobListing } from '@careersignal/agents';
import { computeDedupeKey } from '@careersignal/core';
import type { CanonicalJob, TestBudget } from '@careersignal/core';

export interface BudgetedCrawlConfig {
  sourceUrl: string;
  sourceId: string;
  sourceName: string;
  /** Base directory for evidence (e.g. data/evidence/crawl) */
  evidenceDir: string;
  /** Slug for subfolder and extractor hints (e.g. company id or normalized name) */
  slug?: string;
}

export interface BudgetedCrawlResult {
  jobs: CanonicalJob[];
  evidencePath: string;
  errors: string[];
  pagesVisited: number;
}

const DEFAULT_BUDGET: Required<Pick<TestBudget, 'max_pages' | 'max_jobs' | 'timeout_ms'>> = {
  max_pages: 3,
  max_jobs: 50,
  timeout_ms: 60_000,
};

/**
 * Resolve URL (relative or absolute) against base.
 */
function resolveUrl(href: string | undefined | null, baseUrl: string): string | null {
  if (!href?.trim()) return null;
  try {
    return new URL(href.trim(), baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Parse optional posted date string to Date or null.
 */
function parsePostedAt(raw: string | undefined | null): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Map a raw extracted job to canonical shape with dedupe key.
 */
function rawToCanonical(raw: RawJobListing, baseUrl: string, sourcePrefix: string): CanonicalJob {
  const applyUrl = resolveUrl(raw.url ?? raw.extractedFrom, baseUrl);
  const jobUrl = applyUrl ?? resolveUrl(raw.extractedFrom, baseUrl);

  const dedupeKey = computeDedupeKey({
    applyUrl: applyUrl ?? undefined,
    jobUrl: jobUrl ?? undefined,
    externalId: undefined,
    sourcePrefix,
  });

  return {
    title: raw.title?.trim()?.substring(0, 512) || 'Untitled',
    location: raw.location?.trim()?.substring(0, 255) ?? null,
    jobUrl: jobUrl ?? null,
    applyUrl: applyUrl ?? null,
    externalId: null,
    descriptionText: raw.description?.trim()?.substring(0, 20000) ?? null,
    descriptionHtml: null,
    postedAt: parsePostedAt(raw.postedDate),
    status: 'OPEN',
    dedupeKey,
    rawExtract: raw as unknown as Record<string, unknown>,
  };
}

/**
 * Fetch HTML via plain fetch with timeout. Returns null on failure or non-HTML.
 */
async function fetchHtml(
  url: string,
  timeoutMs: number,
): Promise<{ html: string } | { error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return { error: `HTTP ${res.status} ${res.statusText}` };
    const ct = res.headers.get('content-type') ?? '';
    if (
      !ct.toLowerCase().includes('text/html') &&
      !ct.toLowerCase().includes('application/xhtml')
    ) {
      return { error: `Non-HTML content-type: ${ct}` };
    }
    const html = await res.text();
    return { html };
  } catch (e) {
    clearTimeout(timeout);
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

/**
 * Fetch HTML via Playwright (for JS-rendered or fetch-resistant pages).
 */
async function fetchHtmlPlaywright(
  url: string,
  timeoutMs: number,
): Promise<{ html: string } | { error: string }> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(timeoutMs, 30_000),
    });
    await page.waitForTimeout(2000);
    const html = await page.content();
    await browser.close();
    return { html };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Heuristic: pick URLs that look like "next page" (same path + query page/offset).
 */
function pickPaginationCandidates(links: string[], currentUrl: string, maxPick: number): string[] {
  const base = new URL(currentUrl);
  const sameOrigin: string[] = [];
  for (const u of links) {
    try {
      const parsed = new URL(u);
      if (parsed.origin !== base.origin) continue;
      const path = parsed.pathname;
      const pageParam =
        parsed.searchParams.get('page') ??
        parsed.searchParams.get('p') ??
        parsed.searchParams.get('offset');
      const hasPage =
        /\/page\/\d+/i.test(path) ||
        /\/p\/\d+/i.test(path) ||
        (pageParam != null && /\d+/.test(pageParam));
      if (hasPage || path === base.pathname) sameOrigin.push(u);
    } catch {
      continue;
    }
  }
  return sameOrigin.slice(0, maxPick);
}

/**
 * Run a budgeted crawl: fetch pages, save evidence, extract jobs, enforce limits.
 */
export async function runBudgetedCrawl(
  config: BudgetedCrawlConfig,
  budget?: TestBudget | null,
): Promise<BudgetedCrawlResult> {
  const maxPages = budget?.max_pages ?? DEFAULT_BUDGET.max_pages;
  const maxJobs = budget?.max_jobs ?? DEFAULT_BUDGET.max_jobs;
  const timeoutMs = budget?.timeout_ms ?? DEFAULT_BUDGET.timeout_ms;

  const errors: string[] = [];
  const allJobs: CanonicalJob[] = [];
  const visited = new Set<string>();
  const slug = config.slug ?? config.sourceId;
  const evidenceSubDir = join(config.evidenceDir, slug);
  let evidencePath = '';
  let pagesVisited = 0;

  const sourcePrefix = `crawl:${slug}`;

  let queue: string[] = [config.sourceUrl];

  while (queue.length > 0 && pagesVisited < maxPages && allJobs.length < maxJobs) {
    const url = queue.shift()!;
    const norm = url.replace(/#.*$/, '').trim();
    if (visited.has(norm)) continue;
    visited.add(norm);

    let html: string;
    let fetchResult = await fetchHtml(url, timeoutMs);
    if ('error' in fetchResult) {
      fetchResult = await fetchHtmlPlaywright(url, timeoutMs);
      if ('error' in fetchResult) {
        errors.push(`Fetch ${url}: ${fetchResult.error}`);
        continue;
      }
    }
    html = fetchResult.html;
    pagesVisited += 1;

    try {
      await mkdir(evidenceSubDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = join(evidenceSubDir, `${timestamp}.html`);
      await writeFile(filePath, html, 'utf-8');
      if (!evidencePath) evidencePath = filePath;
    } catch (e) {
      errors.push(`Evidence write: ${e instanceof Error ? e.message : String(e)}`);
    }

    const extractResult = await extractJobsFromHtml(html, url, { slug });
    for (const raw of extractResult.listings) {
      if (allJobs.length >= maxJobs) break;
      try {
        allJobs.push(rawToCanonical(raw, url, sourcePrefix));
      } catch (e) {
        errors.push(`Normalize "${raw.title}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (pagesVisited < maxPages && allJobs.length < maxJobs) {
      const links = extractLinksFromHtml(html, url);
      const nextCandidates = pickPaginationCandidates(links, url, 5).filter(
        (u) => !visited.has(u.replace(/#.*$/, '').trim()),
      );
      queue = [...nextCandidates.slice(0, 2), ...queue.slice(0, 3)];
    }
  }

  return {
    jobs: allJobs.slice(0, maxJobs),
    evidencePath,
    errors,
    pagesVisited,
  };
}
