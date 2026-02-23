/**
 * Deep Scraper Agent — Visits individual job/company pages to get full details.
 *
 * Two modes:
 * 1. Job Detail: Visit /jobs/ID-slug → extract full description, requirements, etc.
 * 2. Company Jobs: Visit /company/slug/jobs → discover all job links for that company.
 *
 * Uses the same browser instance to avoid launching many Chromium processes.
 */

import type { Page } from 'playwright';
import type { RawJobListing } from './types.js';

const WELLFOUND_BASE = 'https://wellfound.com';

export interface DeepScrapeResult {
  jobsEnriched: RawJobListing[];
  discoveredUrls: string[];
  pagesVisited: number;
  errors: string[];
}

/**
 * Deep-scrape a batch of URLs using an existing Playwright page.
 * Visits each URL, extracts data, and returns enriched job listings.
 */
export async function deepScrapeUrls(
  page: Page,
  urls: Array<{ url: string; type: 'job_detail' | 'company_jobs'; label: string }>,
  existingListings: RawJobListing[],
  options?: { maxPages?: number; delayMs?: number },
): Promise<DeepScrapeResult> {
  const maxPages = options?.maxPages ?? 10;
  const delayMs = options?.delayMs ?? 2000;
  const enriched: RawJobListing[] = [];
  const discoveredUrls: string[] = [];
  const errors: string[] = [];
  let pagesVisited = 0;

  const existingUrls = new Set(existingListings.map((l) => l.url));

  const toVisit = urls.slice(0, maxPages);

  for (const target of toVisit) {
    try {
      await new Promise((r) => setTimeout(r, delayMs + Math.random() * 1000));
      await page.goto(target.url, { waitUntil: 'load', timeout: 25000 });
      await new Promise((r) => setTimeout(r, 3000));
      const html = await page.content();
      pagesVisited++;

      if (target.type === 'job_detail') {
        const job = extractJobDetailPage(html, target.url);
        if (job) {
          enriched.push(job);
        }
      } else if (target.type === 'company_jobs') {
        const { jobs, moreUrls } = extractCompanyJobsPage(html, target.url);
        enriched.push(...jobs);
        for (const u of moreUrls) {
          if (!existingUrls.has(u)) {
            discoveredUrls.push(u);
            existingUrls.add(u);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${target.url}: ${msg}`);
    }
  }

  return { jobsEnriched: enriched, discoveredUrls, pagesVisited, errors };
}

/**
 * Extract full job details from a Wellfound job detail page (/jobs/ID-slug).
 */
function extractJobDetailPage(html: string, pageUrl: string): RawJobListing | null {
  // Title: usually in <h1> or <h2>
  const titleMatch =
    html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ??
    html.match(/<h2[^>]*class="[^"]*font-bold[^"]*"[^>]*>([^<]+)<\/h2>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  if (!title || title.length < 2) return null;

  // Company: from company logo alt, company link text, or nearby span
  let company = 'Unknown';
  const companyLinkMatch = html.match(/href="\/company\/[^"]*"[^>]*>([^<]{2,80})<\/a>/);
  if (companyLinkMatch) {
    company = companyLinkMatch[1].trim();
  } else {
    const companyImgMatch = html.match(/alt="([^"]+?)\s+(?:company\s+)?logo"/i);
    if (companyImgMatch) company = companyImgMatch[1].trim();
  }

  // Salary
  let salary: string | undefined;
  const salaryMatch = html.match(/(\$[\d,]+k?\s*[–\-]\s*\$[\d,]+k?)/);
  if (salaryMatch) salary = salaryMatch[1];

  // Location
  let location: string | undefined;
  const locationMatch = html.match(/(?:location|remote|office)[^>]*>[^<]*?<[^>]*>([^<]{2,100})</i);
  if (locationMatch) location = locationMatch[1].trim();

  // Description: grab the largest text block from the page body
  let description: string | undefined;
  const bodyStart = html.indexOf('<body');
  const bodyContent = bodyStart > 0 ? html.substring(bodyStart) : html;
  const descBlocks = bodyContent.match(
    /<(?:div|section|article)[^>]*>[\s\S]{200,5000}?<\/(?:div|section|article)>/gi,
  );
  if (descBlocks) {
    const cleaned = descBlocks
      .map((b) =>
        b
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((b) => b.length > 100)
      .sort((a, b) => b.length - a.length);
    description = cleaned[0]?.substring(0, 3000);
  }

  return {
    title: title.substring(0, 512),
    company,
    location,
    salary,
    description,
    url: pageUrl,
    extractedFrom: pageUrl,
    confidence: 0.9,
  };
}

/**
 * Extract job listings from a Wellfound company jobs page (/company/slug/jobs).
 * Returns individual job listings and discovered job detail URLs.
 */
function extractCompanyJobsPage(
  html: string,
  pageUrl: string,
): { jobs: RawJobListing[]; moreUrls: string[] } {
  const jobs: RawJobListing[] = [];
  const moreUrls: string[] = [];
  const seen = new Set<string>();

  // Extract company name from page
  let companyName = 'Unknown';
  const companyH1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (companyH1) {
    companyName = companyH1[1]
      .trim()
      .replace(/\s*Jobs$/, '')
      .trim();
  } else {
    const companyFromUrl = pageUrl.match(/\/company\/([^/]+)/);
    if (companyFromUrl) {
      companyName = companyFromUrl[1]
        .replace(/-\d+$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  // Find all /jobs/ID-slug links on the page
  const jobLinkRegex = /href="(\/jobs\/(\d+)-([^"]*))"/g;
  let m: RegExpExecArray | null;
  while ((m = jobLinkRegex.exec(html)) !== null) {
    const href = m[1];
    const slugPart = m[3];
    const fullUrl = `${WELLFOUND_BASE}${href}`;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);
    moreUrls.push(fullUrl);

    // Extract title from link text
    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleRegex = new RegExp(`href="${escapedHref}"[^>]*>([^<]+)<`);
    const pos = m.index;
    const ctx = html.substring(Math.max(0, pos - 500), Math.min(html.length, pos + 500));
    const titleMatch = ctx.match(titleRegex);
    const title = titleMatch ? titleMatch[1].trim() : slugPart.replace(/-/g, ' ').trim();

    // Salary from nearby context
    let salary: string | undefined;
    const salaryMatch = ctx.match(/(\$[\d,]+k?\s*[–\-]\s*\$[\d,]+k?)/);
    if (salaryMatch) salary = salaryMatch[1];

    // Location from nearby context
    let location: string | undefined;
    const locationMatch = ctx.match(/class="text-gray-700"[^>]*>([^<]{2,200})/);
    if (locationMatch) {
      const raw = locationMatch[1].replace(/<!--.*?-->/g, '').trim();
      const parts = raw
        .split(/\s*•\s*/)
        .filter((p) => p && !/\$|equity/i.test(p) && !/ago|yesterday|today/i.test(p));
      location = parts.join(' • ') || undefined;
    }

    jobs.push({
      title: title.substring(0, 512),
      company: companyName,
      location,
      salary,
      url: fullUrl,
      extractedFrom: pageUrl,
      confidence: 0.8,
    });
  }

  return { jobs, moreUrls };
}
