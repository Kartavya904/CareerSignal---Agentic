/**
 * DOM Extractor Agent - Extracts job listings from HTML
 *
 * Responsibilities:
 * - Parse HTML to find job listing cards
 * - Extract structured data from each listing
 * - Site-specific extractors for Wellfound, LinkedIn
 * - Fall back to LLM for messy layouts
 *
 * LLM Usage: Light (fallback for unusual HTML layouts)
 */

import { complete } from '@careersignal/llm';
import type { RawJobListing, ExtractionStrategy } from './types.js';

export interface ExtractionResult {
  listings: RawJobListing[];
  strategy: ExtractionStrategy;
  confidence: number;
  rawHtml?: string;
}

/** Discovered URLs for deep scraping (company pages, job detail pages) */
export interface DiscoveredUrl {
  url: string;
  type: 'job_detail' | 'company_jobs';
  label: string;
}

const WELLFOUND_BASE = 'https://wellfound.com';
const LINKEDIN_BASE = 'https://www.linkedin.com';

// ---------------------------------------------------------------------------
// Wellfound extractor — built from actual 2025/2026 HTML structure
// ---------------------------------------------------------------------------

/**
 * Site-specific extraction for Wellfound (AngelList).
 *
 * Wellfound's /jobs page renders job listings with this HTML pattern:
 *   <a href="/company/slug"><img alt="Company company logo" ...></a>
 *   <a href="/jobs/ID-title-slug">Job Title</a>
 *   <span>Company<!-- --> • </span>
 *   <span class="text-gray-700">Location • Salary • Date</span>
 *
 * Company cards (trending):
 *   <a href="/company/slug">Company Name</a>
 *   <a href="/company/slug/jobs"><span>N open positions</span></a>
 */
function extractFromWellfound(html: string, sourceUrl: string): RawJobListing[] {
  const listings: RawJobListing[] = [];
  const seen = new Set<string>();

  // Strategy A: Parse job listing rows — /jobs/ID-slug links with surrounding context
  const jobLinkRegex = /href="(\/jobs\/(\d+)-([^"]*))"(?=[^>]*>)/g;
  let m: RegExpExecArray | null;

  while ((m = jobLinkRegex.exec(html)) !== null) {
    const href = m[1];
    const slugPart = m[3];
    const fullUrl = `${WELLFOUND_BASE}${href}`;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    const pos = m.index;
    const ctxStart = Math.max(0, pos - 2000);
    const ctxEnd = Math.min(html.length, pos + 2000);
    const context = html.substring(ctxStart, ctxEnd);

    // Title: text inside the <a> tag containing this href
    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleRegex = new RegExp(`href="${escapedHref}"[^>]*>([^<]+)<`);
    const titleMatch = context.match(titleRegex);
    const titleFromLink = titleMatch ? titleMatch[1].trim() : '';
    const titleFromSlug = slugPart.replace(/-/g, ' ').trim();
    const title = titleFromLink.length >= 2 ? titleFromLink : titleFromSlug || 'Unknown Position';

    // Company: <span>Company<!-- --> • </span> or <img alt="Company company logo">
    let company = 'Unknown';
    const companySpanMatch = context.match(
      /<span>([A-Za-z0-9][^<]{1,80}?)(?:<!--[^>]*-->)?\s*•\s*<\/span>/,
    );
    if (companySpanMatch) {
      company = companySpanMatch[1].trim();
    } else {
      const companyImgMatch = context.match(/alt="([^"]+?)\s+company logo"/i);
      if (companyImgMatch) {
        company = companyImgMatch[1].trim();
      }
    }

    // Details: <span class="text-gray-700">Location • Salary • Date</span>
    // Also handle cleaned HTML where class attributes are stripped — fall back to
    // matching any <span> whose text contains a salary or relative-date pattern.
    let location: string | undefined;
    let salary: string | undefined;
    let postedDate: string | undefined;
    const detailsMatch =
      context.match(/class="text-gray-700"[^>]*>([\s\S]{5,500}?)<\/span>/) ||
      context.match(
        /<span>([^<]*(?:\$[\d,]+k?\s*[–\-]\s*\$[\d,]+k?|today|yesterday|\d+\s+(?:day|hour|week|month)s?\s+ago)[^<]*)<\/span>/i,
      );
    if (detailsMatch) {
      const raw = detailsMatch[1]
        .replace(/<!--.*?-->/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const parts = raw.split(/\s*•\s*/);
      const salaryPattern = /\$[\d,]+k?\s*[–\-]\s*\$[\d,]+k?/;
      const datePattern = /yesterday|today|\d+\s+(?:day|hour|week|month)s?\s+ago/i;
      const locationParts: string[] = [];

      for (const p of parts) {
        const clean = p.trim();
        if (!clean) continue;
        if (salaryPattern.test(clean)) {
          salary = clean;
        } else if (datePattern.test(clean)) {
          postedDate = clean;
        } else if (/equity|no equity/i.test(clean)) {
          // skip
        } else {
          locationParts.push(clean);
        }
      }
      location = locationParts.join(' • ') || undefined;
    }

    listings.push({
      title: title.substring(0, 512),
      company,
      location,
      salary,
      postedDate,
      url: fullUrl,
      extractedFrom: sourceUrl,
      confidence: 0.85,
    });
  }

  // Strategy B: Company cards — /company/slug/jobs with "N open positions"
  const companyJobsRegex =
    /href="(\/company\/([^"]+?)\/jobs)"[^>]*>[\s\S]*?(\d+)\s*(?:<!--.*?-->)?\s*open positions/gi;
  while ((m = companyJobsRegex.exec(html)) !== null) {
    const href = m[1];
    const companySlug = m[2];
    const openCount = parseInt(m[3], 10);
    const fullUrl = `${WELLFOUND_BASE}${href}`;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);
    const companyName = companySlug
      .replace(/-\d+$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    listings.push({
      title: `${openCount} open positions at ${companyName}`,
      company: companyName,
      url: fullUrl,
      extractedFrom: sourceUrl,
      confidence: 0.6,
    });
  }

  // Strategy C: __NEXT_DATA__ JSON (only if HTML regex found nothing)
  if (listings.length === 0) {
    const nextDataMatch = html.match(
      /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
        const fromNext = findJobsInNextData(data, sourceUrl);
        for (const job of fromNext) {
          if (job.url && !seen.has(job.url)) {
            seen.add(job.url);
            listings.push(job);
          }
        }
      } catch {
        // parse failed
      }
    }
  }

  return listings;
}

/** Recursively find job objects in __NEXT_DATA__ tree */
function findJobsInNextData(obj: unknown, sourceUrl: string, depth = 0): RawJobListing[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return [];
  const o = obj as Record<string, unknown>;
  const out: RawJobListing[] = [];

  const extractJob = (j: Record<string, unknown>): RawJobListing | null => {
    const title = (j.title ?? j.name ?? j.position ?? '') as string;
    if (!title || typeof title !== 'string' || title.length < 2) return null;
    const comp = j.company;
    const company = (
      typeof comp === 'object' && comp && 'name' in comp
        ? (comp as { name?: string }).name
        : (comp ?? j.companyName ?? 'Unknown')
    ) as string;
    const url = (j.url ?? j.slug ?? j.id ?? j.jobUrl ?? sourceUrl) as string;
    const location = (j.location ?? j.remote ?? j.locationNames ?? '') as string;
    const fullUrl =
      typeof url === 'string' && url.startsWith('http') ? url : `${WELLFOUND_BASE}${url}`;
    return {
      title: title.substring(0, 512),
      company: String(company || 'Unknown'),
      location: typeof location === 'string' ? location : undefined,
      url: fullUrl,
      extractedFrom: sourceUrl,
      confidence: 0.9,
    };
  };

  if (Array.isArray(o.jobs)) {
    for (const j of o.jobs as Record<string, unknown>[]) {
      const job = extractJob(j);
      if (job) out.push(job);
    }
  }
  if (Array.isArray(o.edges)) {
    for (const edge of o.edges as Record<string, unknown>[]) {
      const j = (edge.node ?? edge) as Record<string, unknown>;
      const job = extractJob(j);
      if (job) out.push(job);
    }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') out.push(...findJobsInNextData(v, sourceUrl, depth + 1));
  }
  return out;
}

/**
 * Discover URLs for deep scraping from Wellfound HTML.
 * Returns company/jobs page URLs and individual job detail URLs.
 */
export function discoverWellfoundUrls(html: string): DiscoveredUrl[] {
  const urls: DiscoveredUrl[] = [];
  const seen = new Set<string>();

  // Company/jobs pages (e.g. /company/bask-health/jobs)
  const companyJobsRegex = /href="(\/company\/([^"]+?)\/jobs)"/g;
  let m: RegExpExecArray | null;
  while ((m = companyJobsRegex.exec(html)) !== null) {
    const fullUrl = `${WELLFOUND_BASE}${m[1]}`;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);
    const slug = m[2]
      .replace(/-\d+$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    urls.push({ url: fullUrl, type: 'company_jobs', label: `${slug} Jobs` });
  }

  // Individual job detail pages (e.g. /jobs/123456-title-slug)
  const jobDetailRegex = /href="(\/jobs\/(\d+)-([^"]*))"/g;
  while ((m = jobDetailRegex.exec(html)) !== null) {
    const fullUrl = `${WELLFOUND_BASE}${m[1]}`;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);
    const label = m[3].replace(/-/g, ' ').trim() || `Job ${m[2]}`;
    urls.push({ url: fullUrl, type: 'job_detail', label });
  }

  return urls;
}

// ---------------------------------------------------------------------------
// LinkedIn extractor
// ---------------------------------------------------------------------------

function extractFromLinkedIn(html: string, sourceUrl: string): RawJobListing[] {
  const listings: RawJobListing[] = [];
  const seen = new Set<string>();

  const viewLinkRegex = /href="(\/jobs\/view\/\d+[^"]*?)"/gi;
  let m: RegExpExecArray | null;
  while ((m = viewLinkRegex.exec(html)) !== null) {
    const href = m[1];
    const fullUrl = href.startsWith('http') ? href : `${LINKEDIN_BASE}${href}`;
    if (!seen.has(fullUrl)) seen.add(fullUrl);
  }

  const titleRegex = /<[^>]+class="[^"]*base-search-card__title[^"]*"[^>]*>([^<]+)<\/[^>]+>/gi;
  const companyRegex = /<[^>]+class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([^<]+)<\/[^>]+>/gi;
  const locationRegex = /<[^>]+class="[^"]*job-search-card__location[^"]*"[^>]*>([^<]+)<\/[^>]+>/gi;

  const titles: string[] = [];
  const companies: string[] = [];
  const locations: string[] = [];

  while ((m = titleRegex.exec(html)) !== null) {
    const t = (m[1] || '').trim();
    if (t.length > 1 && t.length < 200) titles.push(t);
  }
  while ((m = companyRegex.exec(html)) !== null) {
    const c = (m[1] || '').trim();
    if (c.length > 1 && c.length < 200) companies.push(c);
  }
  while ((m = locationRegex.exec(html)) !== null) {
    const loc = (m[1] || '').trim();
    if (loc.length > 1 && loc.length < 200) locations.push(loc);
  }

  const linkAndTextRegex = /href="(\/jobs\/view\/\d+[^"]*?)"[^>]*>([^<]{3,200})<\/a>/gi;
  while ((m = linkAndTextRegex.exec(html)) !== null) {
    const href = m[1];
    const linkText = (m[2] || '').trim();
    const fullUrl = href.startsWith('http') ? href : `${LINKEDIN_BASE}${href}`;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);
    const parts = linkText.split(/[\s·\-–—]+\s*|\s+at\s+/i);
    const title = parts[0]?.trim() || linkText;
    const company = parts[1]?.trim() || 'Unknown';
    listings.push({
      title: title.substring(0, 512),
      company: company || 'Unknown',
      url: fullUrl,
      extractedFrom: sourceUrl,
      confidence: 0.7,
    });
  }

  const links = [...seen];
  const n = Math.min(titles.length, links.length);
  if (n > 0 && listings.length === 0) {
    for (let i = 0; i < n; i++) {
      const title = titles[i] ?? '';
      const company = companies[i] ?? companies[0] ?? 'Unknown';
      const location = locations[i] ?? locations[0] ?? '';
      const url = links[i] ?? sourceUrl;
      if (title) {
        listings.push({
          title: title.substring(0, 512),
          company: company || 'Unknown',
          location: location || undefined,
          url,
          extractedFrom: sourceUrl,
          confidence: 0.7,
        });
      }
    }
  }

  return [...new Map(listings.map((l) => [l.url, l])).values()];
}

// ---------------------------------------------------------------------------
// Main extraction orchestrator
// ---------------------------------------------------------------------------

export async function extractJobsFromHtml(
  html: string,
  sourceUrl: string,
  options?: { slug?: string },
): Promise<ExtractionResult> {
  const slug = options?.slug?.toLowerCase();
  const isWellfound =
    slug === 'wellfound' || (sourceUrl && sourceUrl.toLowerCase().includes('wellfound.com'));

  if (isWellfound) {
    const jobs = extractFromWellfound(html, sourceUrl);
    if (jobs.length > 0) {
      return { listings: jobs, strategy: 'site_specific', confidence: 0.85 };
    }
  }

  if (slug === 'linkedin_jobs') {
    const jobs = extractFromLinkedIn(html, sourceUrl);
    if (jobs.length > 0) {
      return { listings: jobs, strategy: 'site_specific', confidence: 0.7 };
    }
  }

  const jsonLdJobs = extractFromJsonLd(html, sourceUrl);
  if (jsonLdJobs.length > 0) {
    return { listings: jsonLdJobs, strategy: 'json_ld', confidence: 0.95 };
  }

  const llmJobs = await extractWithLlm(html, sourceUrl);
  return { listings: llmJobs, strategy: 'fallback_llm', confidence: 0.5, rawHtml: html };
}

// ---------------------------------------------------------------------------
// Generic extractors
// ---------------------------------------------------------------------------

function extractFromJsonLd(html: string, sourceUrl: string): RawJobListing[] {
  const listings: RawJobListing[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const jobs = Array.isArray(data) ? data : [data];
      for (const job of jobs) {
        if (job['@type'] === 'JobPosting') {
          listings.push({
            title: job.title || '',
            company: job.hiringOrganization?.name || '',
            location: job.jobLocation?.address?.addressLocality || '',
            url: job.url || sourceUrl,
            postedDate: job.datePosted || '',
            salary: formatSalary(job.baseSalary),
            description: job.description || '',
            extractedFrom: sourceUrl,
            confidence: 0.95,
          });
        }
      }
    } catch {
      // Invalid JSON
    }
  }
  return listings;
}

async function extractWithLlm(html: string, sourceUrl: string): Promise<RawJobListing[]> {
  // Skip <head> section to focus on visible content; take body content
  const bodyStart = html.indexOf('<body');
  const bodyContent = bodyStart > 0 ? html.substring(bodyStart) : html;
  const truncatedHtml = bodyContent.substring(0, 50000);

  const prompt = `Extract all job listings from this HTML. For each job, extract:
- title: Job title
- company: Company name
- location: Location
- url: Apply URL (relative URLs should use base: ${sourceUrl})
- postedDate: When posted
- salary: Salary if mentioned

Return JSON array: [{ title, company, location, url, postedDate, salary }]

HTML:
${truncatedHtml}`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 4096,
      timeout: 60000,
    });

    const parsed = JSON.parse(response);
    const jobs = Array.isArray(parsed) ? parsed : [];

    return jobs.map((job: Record<string, string>) => ({
      title: job.title || '',
      company: job.company || '',
      location: job.location || '',
      url: job.url || sourceUrl,
      postedDate: job.postedDate || '',
      salary: job.salary || '',
      extractedFrom: sourceUrl,
      confidence: 0.5,
    }));
  } catch (error) {
    console.error('[DOMExtractor] LLM extraction failed:', error);
    return [];
  }
}

function formatSalary(baseSalary: unknown): string {
  if (!baseSalary || typeof baseSalary !== 'object') return '';
  const salary = baseSalary as Record<string, unknown>;
  if (salary.value) {
    const value = salary.value as Record<string, unknown>;
    if (value.minValue && value.maxValue) {
      return `${value.minValue}-${value.maxValue} ${salary.currency || ''}`;
    }
    return `${value.value || value.minValue || ''} ${salary.currency || ''}`;
  }
  return '';
}
