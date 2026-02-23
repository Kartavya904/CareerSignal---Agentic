/**
 * URL Resolver Agent — Multi-step URL correction for broken/wrong source URLs.
 *
 * Step 1: Try same-domain alternatives (/jobs, /careers, /openings, etc.)
 * Step 2: Search-based discovery (if same-domain fails)
 *
 * Per-source attempt cap to avoid runaway correction loops.
 * Code-driven with HTTP validation.
 */

import { validateSource } from './source-validator-agent.js';

export interface UrlResolverResult {
  correctedUrl: string | null;
  attemptsMade: number;
  method: 'same_domain' | 'search_based' | 'none';
  triedUrls: string[];
}

const SAME_DOMAIN_PATHS = [
  '/jobs',
  '/careers',
  '/openings',
  '/jobs/search',
  '/career',
  '/positions',
  '/job-openings',
  '/work-with-us',
  '/',
];

const MAX_ATTEMPTS_PER_SOURCE = 5;

/**
 * Resolve a corrected URL for a broken source.
 * Returns null if no valid alternative found.
 */
export async function resolveUrl(
  currentUrl: string,
  sourceName: string,
  attemptsSoFar: number,
): Promise<UrlResolverResult> {
  if (attemptsSoFar >= MAX_ATTEMPTS_PER_SOURCE) {
    return { correctedUrl: null, attemptsMade: 0, method: 'none', triedUrls: [] };
  }

  const triedUrls: string[] = [];
  let attemptsMade = 0;
  const remaining = MAX_ATTEMPTS_PER_SOURCE - attemptsSoFar;

  // Step 1: Same-domain alternatives
  let baseUrl: URL;
  try {
    baseUrl = new URL(currentUrl);
  } catch {
    return { correctedUrl: null, attemptsMade: 0, method: 'none', triedUrls: [] };
  }

  for (const pathSuffix of SAME_DOMAIN_PATHS) {
    if (attemptsMade >= remaining) break;

    const candidate = `${baseUrl.protocol}//${baseUrl.host}${pathSuffix}`;
    if (candidate === currentUrl) continue;

    triedUrls.push(candidate);
    attemptsMade++;

    try {
      const result = await validateSource('url-resolver', candidate, {
        timeout: 8000,
        followRedirects: true,
        checkForJobs: true,
      });

      if (result.isValid && result.hasJobListings) {
        return { correctedUrl: candidate, attemptsMade, method: 'same_domain', triedUrls };
      }
    } catch {
      continue;
    }
  }

  // Step 2: Company-name-based patterns
  if (attemptsMade < remaining) {
    const cleanName = sourceName
      .replace(/\s*\(.*\)$/, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

    const companyPatterns = [
      `https://careers.${cleanName}.com`,
      `https://${cleanName}.com/careers`,
      `https://${cleanName}.com/jobs`,
      `https://jobs.${cleanName}.com`,
    ];

    for (const candidate of companyPatterns) {
      if (attemptsMade >= remaining) break;
      if (triedUrls.includes(candidate)) continue;

      triedUrls.push(candidate);
      attemptsMade++;

      try {
        const result = await validateSource('url-resolver', candidate, {
          timeout: 8000,
          followRedirects: true,
          checkForJobs: true,
        });

        if (result.isValid && result.hasJobListings) {
          return { correctedUrl: candidate, attemptsMade, method: 'search_based', triedUrls };
        }
      } catch {
        continue;
      }
    }
  }

  return { correctedUrl: null, attemptsMade, method: 'none', triedUrls };
}

export { MAX_ATTEMPTS_PER_SOURCE };
