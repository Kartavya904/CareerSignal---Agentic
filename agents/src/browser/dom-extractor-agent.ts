/**
 * DOM Extractor Agent - Extracts job listings from HTML
 *
 * Responsibilities:
 * - Parse HTML to find job listing cards
 * - Extract structured data from each listing
 * - Use heuristics to identify job-related content
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

// Common selectors for job listing containers
const JOB_CONTAINER_SELECTORS = [
  '[data-job-id]',
  '[data-job]',
  '.job-card',
  '.job-listing',
  '.job-result',
  '.job-row',
  '.jobsearch-result',
  '.result-card',
  '.posting-card',
  'article[class*="job"]',
  'div[class*="JobCard"]',
  'li[class*="job"]',
];

// Common selectors for job fields
const FIELD_SELECTORS = {
  title: ['h1', 'h2', 'h3', '.job-title', '[class*="title"]', '[data-job-title]'],
  company: ['.company', '.company-name', '[class*="company"]', '[data-company]'],
  location: ['.location', '[class*="location"]', '[data-location]'],
  salary: ['.salary', '[class*="salary"]', '[class*="compensation"]'],
  date: ['.date', '.posted', '[class*="date"]', 'time'],
};

/**
 * Extract job listings from HTML using multiple strategies
 */
export async function extractJobsFromHtml(
  html: string,
  sourceUrl: string,
): Promise<ExtractionResult> {
  // Strategy 1: Try JSON-LD structured data
  const jsonLdJobs = extractFromJsonLd(html, sourceUrl);
  if (jsonLdJobs.length > 0) {
    return {
      listings: jsonLdJobs,
      strategy: 'json_ld',
      confidence: 0.95,
    };
  }

  // Strategy 2: Try generic heuristics
  const heuristicJobs = extractWithHeuristics(html, sourceUrl);
  if (heuristicJobs.length > 0) {
    return {
      listings: heuristicJobs,
      strategy: 'generic_heuristics',
      confidence: 0.7,
    };
  }

  // Strategy 3: Fall back to LLM extraction (expensive, use sparingly)
  const llmJobs = await extractWithLlm(html, sourceUrl);
  return {
    listings: llmJobs,
    strategy: 'fallback_llm',
    confidence: 0.5,
    rawHtml: html,
  };
}

/**
 * Extract from JSON-LD structured data
 */
function extractFromJsonLd(html: string, sourceUrl: string): RawJobListing[] {
  const listings: RawJobListing[] = [];

  // Find all JSON-LD scripts
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
      // Invalid JSON, skip
    }
  }

  return listings;
}

/**
 * Extract using CSS selector heuristics
 */
function extractWithHeuristics(html: string, sourceUrl: string): RawJobListing[] {
  // Note: This is a simplified version - full implementation would use
  // a proper HTML parser like cheerio or jsdom

  // Placeholder - return empty for now, will be implemented with proper DOM parsing
  console.log('[DOMExtractor] Heuristic extraction placeholder');
  return [];
}

/**
 * Extract using LLM as fallback
 */
async function extractWithLlm(html: string, sourceUrl: string): Promise<RawJobListing[]> {
  // Truncate HTML to avoid token limits
  const truncatedHtml = html.substring(0, 15000);

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
      maxTokens: 2048,
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
