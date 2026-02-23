import { describe, it, expect } from 'vitest';
import {
  createPlannerState,
  planNextAction,
  estimateUrlPriority,
  generatePaginationSeeds,
  type PlannerState,
  type FrontierItem,
} from '@/lib/scrape-planner';

const SOURCE = {
  id: 'src-1',
  name: 'Wellfound',
  url: 'https://wellfound.com/jobs',
  slug: 'wellfound',
  type: 'AGGREGATOR',
};

function makeState(overrides?: Partial<PlannerState>): PlannerState {
  return {
    ...createPlannerState(SOURCE, ['https://wellfound.com/jobs']),
    ...overrides,
  };
}

describe('scrape-planner', () => {
  describe('createPlannerState', () => {
    it('creates state with seed URLs in frontier', () => {
      const state = createPlannerState(SOURCE, ['https://wellfound.com/jobs']);
      expect(state.frontier).toHaveLength(1);
      expect(state.frontier[0].url).toBe('https://wellfound.com/jobs');
      expect(state.frontier[0].depth).toBe(0);
    });

    it('creates state with multiple seed URLs', () => {
      const state = createPlannerState(SOURCE, [
        'https://wellfound.com/jobs',
        'https://wellfound.com/company/acme/jobs',
      ]);
      expect(state.frontier).toHaveLength(2);
    });

    it('initializes empty urlSeen set', () => {
      const state = createPlannerState(SOURCE, ['https://wellfound.com/jobs']);
      expect(state.urlSeen.size).toBe(0);
    });

    it('defaults maxDepth to 999 (no effective depth limit)', () => {
      const state = createPlannerState(SOURCE, []);
      expect(state.maxDepth).toBe(999);
    });

    it('defaults urlCorrectionAttempts to 0', () => {
      const state = createPlannerState(SOURCE, []);
      expect(state.urlCorrectionAttempts).toBe(0);
    });
  });

  describe('planNextAction', () => {
    it('returns VISIT_URL when frontier has items', () => {
      const state = makeState();
      const action = planNextAction(state);
      expect(action.type).toBe('VISIT_URL');
      if (action.type === 'VISIT_URL') {
        expect(action.url).toBe('https://wellfound.com/jobs');
        expect(action.depth).toBe(0);
      }
    });

    it('returns CYCLE_DONE when frontier is empty', () => {
      const state = makeState({ frontier: [] });
      const action = planNextAction(state);
      expect(action.type).toBe('CYCLE_DONE');
      if (action.type === 'CYCLE_DONE') {
        expect(action.reason).toBe('Frontier empty');
      }
    });

    it('returns CYCLE_DONE when stop is requested', () => {
      const state = makeState({ stopRequested: true });
      const action = planNextAction(state);
      expect(action.type).toBe('CYCLE_DONE');
      if (action.type === 'CYCLE_DONE') {
        expect(action.reason).toBe('Stop requested');
      }
    });

    it('skips already-seen URLs in frontier', () => {
      const state = makeState({
        frontier: [
          { url: 'https://wellfound.com/jobs', depth: 0 },
          { url: 'https://wellfound.com/company/acme', depth: 1 },
        ],
      });
      state.urlSeen.add('https://wellfound.com/jobs');
      const action = planNextAction(state);
      expect(action.type).toBe('VISIT_URL');
      if (action.type === 'VISIT_URL') {
        expect(action.url).toBe('https://wellfound.com/company/acme');
      }
    });

    it('adds visited URL to urlSeen', () => {
      const state = makeState();
      planNextAction(state);
      expect(state.urlSeen.has('https://wellfound.com/jobs')).toBe(true);
    });

    it('handles LOGIN_WALL_HUMAN adaptation', () => {
      const state = makeState({ frontier: [] });
      state.lastResult = {
        captureId: 'cap-1',
        pageType: null,
        jobsCount: 0,
        adaptation: 'LOGIN_WALL_HUMAN',
        visitedUrl: 'https://wellfound.com/jobs',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('TRIGGER_LOGIN_WALL');
      if (action.type === 'TRIGGER_LOGIN_WALL') {
        expect(action.url).toBe('https://wellfound.com/jobs');
      }
    });

    it('handles CAPTCHA_HUMAN_SOLVE adaptation', () => {
      const state = makeState({ frontier: [] });
      state.lastResult = {
        captureId: 'cap-1',
        pageType: null,
        jobsCount: 0,
        adaptation: 'CAPTCHA_HUMAN_SOLVE',
        visitedUrl: 'https://wellfound.com/jobs',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('TRIGGER_CAPTCHA');
    });

    it('handles TRY_NEW_URL adaptation when under correction cap', () => {
      const state = makeState({ frontier: [] });
      state.lastResult = {
        captureId: 'cap-1',
        pageType: null,
        jobsCount: 0,
        adaptation: 'TRY_NEW_URL',
        suggestedUrl: 'https://wellfound.com/careers',
        visitedUrl: 'https://wellfound.com/jobs',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('APPLY_URL_CORRECTION');
    });

    it('skips TRY_NEW_URL when correction cap reached', () => {
      const state = makeState({
        frontier: [{ url: 'https://wellfound.com/next', depth: 1 }],
        urlCorrectionAttempts: 5,
      });
      state.lastResult = {
        captureId: 'cap-1',
        pageType: null,
        jobsCount: 0,
        adaptation: 'TRY_NEW_URL',
        visitedUrl: 'https://wellfound.com/jobs',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('VISIT_URL');
    });

    it('handles RETRY_EXTRACTION adaptation when under retry cap', () => {
      const state = makeState({ frontier: [] });
      state.lastResult = {
        captureId: 'cap-1',
        pageType: null,
        jobsCount: 0,
        adaptation: 'RETRY_EXTRACTION',
        waitMs: 5000,
        visitedUrl: 'https://wellfound.com/jobs',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('RETRY_WAIT');
      if (action.type === 'RETRY_WAIT') {
        expect(action.waitMs).toBe(5000);
        expect(action.retryUrl).toBe('https://wellfound.com/jobs');
      }
    });

    it('skips RETRY_EXTRACTION when retry cap reached', () => {
      const state = makeState({
        frontier: [],
        retryCount: 3,
        maxRetries: 3,
      });
      state.lastResult = {
        captureId: 'cap-1',
        pageType: null,
        jobsCount: 0,
        adaptation: 'RETRY_EXTRACTION',
        visitedUrl: 'https://wellfound.com/jobs',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('CYCLE_DONE');
    });

    it('RETRY_CYCLE_SOON falls through and continues to next URL in frontier', () => {
      const state = makeState();
      state.lastResult = {
        captureId: 'cap-1',
        pageType: null,
        jobsCount: 0,
        adaptation: 'RETRY_CYCLE_SOON',
        visitedUrl: 'https://wellfound.com/jobs',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('VISIT_URL');
      if (action.type === 'VISIT_URL') {
        expect(action.url).toBe('https://wellfound.com/jobs');
      }
    });

    it('triggers LOGIN_WALL from page type', () => {
      const state = makeState({ frontier: [] });
      state.lastResult = {
        captureId: 'cap-1',
        pageType: 'login_wall',
        jobsCount: 0,
        visitedUrl: 'https://wellfound.com/jobs',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('TRIGGER_LOGIN_WALL');
    });

    it('triggers CAPTCHA from page type', () => {
      const state = makeState({ frontier: [] });
      state.lastResult = {
        captureId: 'cap-1',
        pageType: 'captcha_challenge',
        jobsCount: 0,
        visitedUrl: 'https://wellfound.com/jobs',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('TRIGGER_CAPTCHA');
    });

    it('triggers URL_CORRECTION from error page type', () => {
      const state = makeState({ frontier: [] });
      state.lastResult = {
        captureId: 'cap-1',
        pageType: 'error',
        jobsCount: 0,
        visitedUrl: 'https://wellfound.com/broken',
        visitedDepth: 0,
      };
      const action = planNextAction(state);
      expect(action.type).toBe('APPLY_URL_CORRECTION');
    });

    it('resets retryCount when visiting a new URL', () => {
      const state = makeState({ retryCount: 2 });
      planNextAction(state);
      expect(state.retryCount).toBe(0);
    });
  });

  describe('estimateUrlPriority', () => {
    it('gives highest priority to /jobs listing URLs', () => {
      expect(estimateUrlPriority('https://wellfound.com/jobs')).toBe(90);
      expect(estimateUrlPriority('https://wellfound.com/jobs?page=1')).toBe(90);
    });

    it('gives high priority to company/jobs URLs', () => {
      const p = estimateUrlPriority('https://wellfound.com/company/acme/jobs');
      expect(p).toBe(85);
    });

    it('gives medium-high priority to company pages', () => {
      const p = estimateUrlPriority('https://wellfound.com/company/acme');
      expect(p).toBe(80);
    });

    it('gives medium priority to pagination URLs', () => {
      const p = estimateUrlPriority('https://wellfound.com/jobs?page=3');
      expect(p).toBeGreaterThanOrEqual(75);
    });

    it('gives lower priority to job detail URLs', () => {
      const p = estimateUrlPriority('https://wellfound.com/jobs/123-engineer');
      expect(p).toBe(40);
    });

    it('gives default priority to unknown URLs', () => {
      const p = estimateUrlPriority('https://wellfound.com/some-page');
      expect(p).toBe(50);
    });
  });

  describe('frontier prioritization', () => {
    it('pops listing URLs before detail URLs', () => {
      const state = makeState({
        frontier: [
          { url: 'https://wellfound.com/jobs/123-detail', depth: 1 },
          { url: 'https://wellfound.com/jobs', depth: 0 },
          { url: 'https://wellfound.com/jobs/456-another', depth: 1 },
        ],
      });
      const action = planNextAction(state);
      expect(action.type).toBe('VISIT_URL');
      if (action.type === 'VISIT_URL') {
        expect(action.url).toBe('https://wellfound.com/jobs');
      }
    });

    it('pops company_careers before detail URLs', () => {
      const state = makeState({
        frontier: [
          { url: 'https://wellfound.com/jobs/123-detail', depth: 1 },
          { url: 'https://wellfound.com/company/acme/jobs', depth: 1 },
        ],
      });
      const action = planNextAction(state);
      if (action.type === 'VISIT_URL') {
        expect(action.url).toBe('https://wellfound.com/company/acme/jobs');
      }
    });
  });

  describe('generatePaginationSeeds', () => {
    it('generates pagination URLs for listing pages', () => {
      const seeds = generatePaginationSeeds('https://wellfound.com/jobs', 5);
      expect(seeds).toHaveLength(4);
      expect(seeds[0]).toContain('page=2');
      expect(seeds[3]).toContain('page=5');
    });

    it('generates pagination for company/jobs pages', () => {
      const seeds = generatePaginationSeeds('https://wellfound.com/company/acme/jobs');
      expect(seeds.length).toBeGreaterThan(0);
      expect(seeds[0]).toContain('page=2');
    });

    it('returns empty for detail page URLs', () => {
      const seeds = generatePaginationSeeds('https://wellfound.com/jobs/123-engineer');
      expect(seeds).toHaveLength(0);
    });

    it('returns empty for non-listing URLs', () => {
      const seeds = generatePaginationSeeds('https://wellfound.com/about');
      expect(seeds).toHaveLength(0);
    });

    it('respects maxPages parameter', () => {
      const seeds = generatePaginationSeeds('https://wellfound.com/jobs', 3);
      expect(seeds).toHaveLength(2);
    });

    it('handles invalid URLs', () => {
      const seeds = generatePaginationSeeds('not-a-url');
      expect(seeds).toHaveLength(0);
    });
  });
});
