/**
 * Default-Sources Scrape Planner — Pure code, no LLM.
 *
 * Given crawl state (frontier, urlSeen, lastResult, urlCorrectionAttempts),
 * outputs a single next action. Deterministic and testable.
 *
 * Cleanup and classification happen inline during VISIT_URL execution (not as
 * separate Planner steps). The Planner only decides WHAT to visit or do next.
 */

import { type PageType, normalizeUrl } from '@careersignal/agents';

// ── Actions the Planner can output ──────────────────────────────────────────

export type PlannerAction =
  | { type: 'VISIT_URL'; url: string; depth: number }
  | { type: 'TRIGGER_LOGIN_WALL'; url: string }
  | { type: 'TRIGGER_CAPTCHA'; url: string }
  | { type: 'APPLY_URL_CORRECTION'; url: string; sourceName: string }
  | { type: 'RETRY_WAIT'; waitMs: number; reason: string; retryUrl: string; retryDepth: number }
  | { type: 'CYCLE_DONE'; reason: string };

// ── Brain adaptations fed back into state ───────────────────────────────────

export type BrainAdaptation =
  | 'RETRY_EXTRACTION'
  | 'TRY_NEW_URL'
  | 'CAPTCHA_HUMAN_SOLVE'
  | 'LOGIN_WALL_HUMAN'
  | 'RETRY_CYCLE_SOON'
  | null;

// ── Frontier item ───────────────────────────────────────────────────────────

export interface FrontierItem {
  url: string;
  depth: number;
  priority?: number;
}

// ── Last result from Brain execution ────────────────────────────────────────

export interface LastResult {
  captureId: string;
  pageType: PageType | null;
  jobsCount: number;
  error?: string;
  adaptation?: BrainAdaptation;
  suggestedUrl?: string;
  waitMs?: number;
  visitedUrl?: string;
  visitedDepth?: number;
}

// ── Planner state (full crawl state for one source) ────────────────────────

export interface PlannerState {
  source: { id: string; name: string; url: string; slug: string | null; type: string };
  frontier: FrontierItem[];
  urlSeen: Set<string>;
  urlCorrectionAttempts: number;
  maxUrlCorrectionAttempts: number;
  maxDepth: number;
  lastResult: LastResult | null;
  stopRequested: boolean;
  retryCount: number;
  maxRetries: number;
  /** Consecutive page visits that yielded 0 jobs; used to stop when crawl is exhausted. */
  consecutiveZeroJobVisits: number;
  maxConsecutiveZeroJobVisits: number;
}

const DEFAULT_MAX_DEPTH = 999;
const DEFAULT_MAX_URL_CORRECTION = 5;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_CONSECUTIVE_ZERO_JOB_VISITS = 15;

export function createPlannerState(
  source: PlannerState['source'],
  seedUrls: string[],
): PlannerState {
  const frontier: FrontierItem[] = seedUrls.map((url) => ({ url, depth: 0 }));
  return {
    source,
    frontier,
    urlSeen: new Set<string>(),
    urlCorrectionAttempts: 0,
    maxUrlCorrectionAttempts: DEFAULT_MAX_URL_CORRECTION,
    maxDepth: DEFAULT_MAX_DEPTH,
    lastResult: null,
    stopRequested: false,
    retryCount: 0,
    maxRetries: DEFAULT_MAX_RETRIES,
    consecutiveZeroJobVisits: 0,
    maxConsecutiveZeroJobVisits: DEFAULT_MAX_CONSECUTIVE_ZERO_JOB_VISITS,
  };
}

/**
 * Compute the next action. Called after every Brain execution.
 * Pure code — no LLM, no I/O, no side effects.
 */
export function planNextAction(state: PlannerState): PlannerAction {
  if (state.stopRequested) {
    return { type: 'CYCLE_DONE', reason: 'Stop requested' };
  }

  // Handle Brain adaptations first. Only trigger login/captcha when the Page Classifier actually classified the page as such — avoid false positives from validator (e.g. "sign in" in nav on a normal listing page).
  if (state.lastResult?.adaptation) {
    const adapt = state.lastResult.adaptation;

    if (adapt === 'LOGIN_WALL_HUMAN') {
      if (state.lastResult.pageType === 'login_wall') {
        const url = state.lastResult.visitedUrl ?? state.source.url;
        state.lastResult.adaptation = null;
        return { type: 'TRIGGER_LOGIN_WALL', url };
      }
      state.lastResult.adaptation = null;
    }

    if (adapt === 'CAPTCHA_HUMAN_SOLVE') {
      if (state.lastResult.pageType === 'captcha_challenge') {
        const url = state.lastResult.visitedUrl ?? state.source.url;
        state.lastResult.adaptation = null;
        return { type: 'TRIGGER_CAPTCHA', url };
      }
      state.lastResult.adaptation = null;
    }

    if (adapt === 'TRY_NEW_URL') {
      if (state.urlCorrectionAttempts < state.maxUrlCorrectionAttempts) {
        const url = state.lastResult.suggestedUrl ?? state.source.url;
        state.lastResult.adaptation = null;
        return { type: 'APPLY_URL_CORRECTION', url, sourceName: state.source.name };
      }
      state.lastResult.adaptation = null;
    }

    if (adapt === 'RETRY_EXTRACTION') {
      if (state.retryCount < state.maxRetries) {
        const waitMs = state.lastResult.waitMs ?? 10000;
        const retryUrl = state.lastResult.visitedUrl ?? state.source.url;
        const retryDepth = state.lastResult.visitedDepth ?? 0;
        state.retryCount++;
        state.lastResult.adaptation = null;
        return {
          type: 'RETRY_WAIT',
          waitMs,
          reason: 'Brain: retry extraction',
          retryUrl,
          retryDepth,
        };
      }
      state.lastResult.adaptation = null;
    }

    if (adapt === 'RETRY_CYCLE_SOON') {
      state.lastResult.adaptation = null;
      // Do not return CYCLE_DONE: fall through and pop next URL from frontier so we keep exploring.
    }
  }

  // After classify, check the page type for special handling
  if (state.lastResult?.pageType === 'login_wall') {
    const url = state.lastResult.visitedUrl ?? state.source.url;
    state.lastResult.pageType = null;
    return { type: 'TRIGGER_LOGIN_WALL', url };
  }

  if (state.lastResult?.pageType === 'captcha_challenge') {
    const url = state.lastResult.visitedUrl ?? state.source.url;
    state.lastResult.pageType = null;
    return { type: 'TRIGGER_CAPTCHA', url };
  }

  if (state.lastResult?.pageType === 'error') {
    if (state.urlCorrectionAttempts < state.maxUrlCorrectionAttempts) {
      state.lastResult.pageType = null;
      return {
        type: 'APPLY_URL_CORRECTION',
        url: state.lastResult.visitedUrl ?? state.source.url,
        sourceName: state.source.name,
      };
    }
  }

  // Pop next URL from frontier, preferring higher-priority items. Use normalized URL for urlSeen so we don't revisit the same page under different query strings.
  while (state.frontier.length > 0) {
    const nextIdx = pickHighestPriority(state.frontier);
    const next = state.frontier.splice(nextIdx, 1)[0]!;
    const norm = normalizeUrl(next.url);
    if (state.urlSeen.has(norm)) {
      continue;
    }
    state.urlSeen.add(norm);
    state.retryCount = 0;
    return { type: 'VISIT_URL', url: next.url, depth: next.depth };
  }

  return { type: 'CYCLE_DONE', reason: 'Frontier empty' };
}

/**
 * URL-based priority: listing/company_careers > pagination > category > detail > other.
 * Higher number = higher priority.
 */
export function estimateUrlPriority(url: string): number {
  const lower = url.toLowerCase();
  if (/\/company\/[^/]+\/jobs/.test(lower)) return 85;
  if (/\/company\/[^/]+\/?$/.test(lower)) return 80;
  if (/\/jobs\/\d+-/.test(lower) || /\/job\/\d+/.test(lower)) return 40;
  if (lower.endsWith('/jobs') || lower.includes('/jobs?') || lower.includes('/jobs/search'))
    return 90;
  if (/[?&]page=\d+/.test(lower)) return 75;
  if (/\/role\/|\/category\/|\/department\//.test(lower)) return 70;
  return 50;
}

function pickHighestPriority(frontier: FrontierItem[]): number {
  let bestIdx = 0;
  let bestPriority = frontier[0]?.priority ?? estimateUrlPriority(frontier[0]?.url ?? '');

  for (let i = 1; i < frontier.length; i++) {
    const item = frontier[i]!;
    const p = item.priority ?? estimateUrlPriority(item.url);
    if (p > bestPriority) {
      bestPriority = p;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Generate pagination URLs from a listing page URL.
 * If the URL looks like a listing page, produce ?page=2..?page=maxPages variants.
 */
export function generatePaginationSeeds(listingUrl: string, maxPages = 5): string[] {
  try {
    const u = new URL(listingUrl);
    const lower = u.pathname.toLowerCase();
    const isListing =
      lower.endsWith('/jobs') ||
      lower.includes('/jobs/search') ||
      /\/company\/[^/]+\/jobs/.test(lower);
    if (!isListing) return [];

    const seeds: string[] = [];
    for (let p = 2; p <= maxPages; p++) {
      const copy = new URL(listingUrl);
      copy.searchParams.set('page', String(p));
      seeds.push(copy.toString());
    }
    return seeds;
  } catch {
    return [];
  }
}
