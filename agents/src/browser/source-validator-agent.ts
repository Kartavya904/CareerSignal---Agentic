/**
 * Source Validator Agent - Validates job source URLs
 *
 * Responsibilities:
 * - Check URL reachability (HTTP status)
 * - Verify content is job-related
 * - Detect blockers (CAPTCHA, login required)
 * - Suggest URL corrections when broken
 *
 * LLM Usage: None (HTTP requests + content checks)
 */

import type { SourceValidationResult } from './types.js';

export interface ValidationConfig {
  timeout: number;
  followRedirects: boolean;
  checkForJobs: boolean;
}

const DEFAULT_CONFIG: ValidationConfig = {
  timeout: 10000,
  followRedirects: true,
  checkForJobs: true,
};

// Patterns that indicate job-related content
const JOB_INDICATORS = [
  'career',
  'jobs',
  'job-openings',
  'opportunities',
  'positions',
  'hiring',
  'apply',
  'employment',
  'openings',
  'vacancies',
];

// Patterns that indicate blockers. Avoid false positives: many sites include
// "recaptcha" in script tags on normal pages — only flag clear challenge prompts.
const BLOCKER_PATTERNS = {
  captcha: [
    'complete the captcha',
    'verify you are human',
    'solve the captcha',
    'captcha challenge',
    'please complete the captcha',
  ],
  loginRequired: ['sign in', 'log in', 'login required', 'please sign in'],
  accessDenied: ['access denied', '403 forbidden', 'blocked by', '403 ', 'forbidden'],
  notFound: [
    '404 - page not found',
    '404 page',
    'page not found',
    'this page does not exist',
    'no longer available',
  ],
};

/**
 * Validate a source URL
 */
export async function validateSource(
  sourceId: string,
  url: string,
  config: ValidationConfig = DEFAULT_CONFIG,
): Promise<SourceValidationResult> {
  const validatedAt = new Date().toISOString();

  try {
    // Perform HTTP request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: config.followRedirects ? 'follow' : 'manual',
    });

    clearTimeout(timeoutId);

    const html = await response.text();
    const statusCode = response.status;

    // Check for blockers
    const blocker = detectBlocker(html);
    if (blocker) {
      return {
        sourceId,
        url,
        isValid: false,
        statusCode,
        errorMessage: blocker,
        validatedAt,
      };
    }

    // Check if content is job-related
    const hasJobListings = config.checkForJobs ? detectJobContent(html) : undefined;

    return {
      sourceId,
      url,
      isValid: statusCode >= 200 && statusCode < 400,
      statusCode,
      hasJobListings,
      validatedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      sourceId,
      url,
      isValid: false,
      errorMessage: errorMessage.includes('abort') ? 'Request timeout' : errorMessage,
      validatedAt,
    };
  }
}

/**
 * Detect if page has blocker. "recaptcha" alone is NOT flagged — many sites
 * include it in scripts on normal pages.
 */
function detectBlocker(html: string): string | null {
  const lowerHtml = html.toLowerCase();

  for (const [blockerType, patterns] of Object.entries(BLOCKER_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerHtml.includes(pattern)) {
        return `Blocked: ${blockerType} detected`;
      }
    }
  }

  return null;
}

/**
 * Detect if page contains job-related content
 */
function detectJobContent(html: string): boolean {
  const lowerHtml = html.toLowerCase();

  // Check for job indicators
  const hasIndicators = JOB_INDICATORS.some((indicator) => lowerHtml.includes(indicator));

  // Check for common job listing patterns
  const hasJobPatterns =
    lowerHtml.includes('job-card') ||
    lowerHtml.includes('job-listing') ||
    lowerHtml.includes('jobposting') ||
    lowerHtml.includes('job-title') ||
    lowerHtml.includes('apply now');

  return hasIndicators || hasJobPatterns;
}

/**
 * Suggest corrected URL when original is broken
 */
export async function suggestCorrectedUrl(
  companyName: string,
  brokenUrl: string,
): Promise<string | null> {
  // Common career page URL patterns
  const patterns = [
    `https://careers.${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
    `https://${companyName.toLowerCase().replace(/\s+/g, '')}.com/careers`,
    `https://${companyName.toLowerCase().replace(/\s+/g, '')}.com/jobs`,
    `https://jobs.${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
  ];

  // Try each pattern
  for (const url of patterns) {
    try {
      const result = await validateSource('temp', url, {
        timeout: 5000,
        followRedirects: true,
        checkForJobs: true,
      });

      if (result.isValid && result.hasJobListings) {
        return url;
      }
    } catch {
      // Continue to next pattern
    }
  }

  return null;
}
