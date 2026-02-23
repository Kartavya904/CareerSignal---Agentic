import { describe, it, expect, vi } from 'vitest';

vi.mock('@careersignal/llm', () => ({
  complete: vi.fn().mockImplementation(async () =>
    JSON.stringify({
      verdict: 'ok',
      message: 'Extraction successful. 15 jobs found.',
      diagnosis: 'Wellfound listing page loaded correctly with job cards.',
      userRecommendation: 'No action needed. Pipeline is working.',
      nextAction: 'CONTINUE',
      cycleDelaySeconds: 10,
    }),
  ),
}));

import {
  runBrainAnalysis,
  brainOrchestrate,
  type BrainDecision,
  type BrainContext,
} from '@/lib/brain-agent';

const makeContext = (overrides?: Partial<BrainContext>): BrainContext => ({
  sourceName: 'Wellfound',
  sourceUrl: 'https://wellfound.com/jobs',
  sourceSlug: 'wellfound',
  jobsExtracted: 15,
  validationPassed: true,
  recentLogSnippet: '[Navigator] Captured raw HTML\n[DOM Extractor] Found 15 listings',
  htmlCharCount: 50000,
  cycleNumber: 1,
  extractionStrategy: 'site_specific',
  attemptNumber: 1,
  pageType: 'listing',
  depth: 0,
  frontierSize: 20,
  urlCorrectionAttempts: 0,
  ...overrides,
});

describe('brain-agent', () => {
  describe('runBrainAnalysis', () => {
    it('returns a valid BrainDecision object', async () => {
      const decision = await runBrainAnalysis(makeContext());
      expect(decision).toHaveProperty('verdict');
      expect(decision).toHaveProperty('message');
      expect(decision).toHaveProperty('nextAction');
      expect(decision).toHaveProperty('cycleDelaySeconds');
    });

    it('verdict is either "ok" or "problem"', async () => {
      const decision = await runBrainAnalysis(makeContext());
      expect(['ok', 'problem']).toContain(decision.verdict);
    });

    it('nextAction is a valid Brain action', async () => {
      const decision = await runBrainAnalysis(makeContext());
      const validActions = [
        'RETRY_EXTRACTION',
        'TRY_NEW_URL',
        'CAPTCHA_HUMAN_SOLVE',
        'LOGIN_WALL_HUMAN',
        'CONTINUE',
        'RETRY_CYCLE_SOON',
      ];
      expect(validActions).toContain(decision.nextAction);
    });

    it('cycleDelaySeconds is between 10 and 60', async () => {
      const decision = await runBrainAnalysis(makeContext());
      expect(decision.cycleDelaySeconds).toBeGreaterThanOrEqual(10);
      expect(decision.cycleDelaySeconds).toBeLessThanOrEqual(60);
    });

    it('includes message string', async () => {
      const decision = await runBrainAnalysis(makeContext());
      expect(typeof decision.message).toBe('string');
      expect(decision.message.length).toBeGreaterThan(0);
    });
  });

  describe('runBrainAnalysis — error handling', () => {
    it('returns CONTINUE on LLM failure', async () => {
      const { complete } = await import('@careersignal/llm');
      (complete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('LLM timeout'));

      const decision = await runBrainAnalysis(makeContext());
      expect(decision.nextAction).toBe('CONTINUE');
      expect(decision.verdict).toBe('ok');
    });
  });

  describe('runBrainAnalysis — problem detection mock', () => {
    it('handles TRY_NEW_URL response', async () => {
      const { complete } = await import('@careersignal/llm');
      (complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          verdict: 'problem',
          message: 'URL appears to be wrong.',
          diagnosis: 'No job content found.',
          userRecommendation: 'Try a different URL.',
          nextAction: 'TRY_NEW_URL',
          suggestedUrl: 'https://wellfound.com/careers',
          cycleDelaySeconds: 15,
        }),
      );

      const decision = await runBrainAnalysis(makeContext({ jobsExtracted: 0 }));
      expect(decision.nextAction).toBe('TRY_NEW_URL');
      expect(decision.verdict).toBe('problem');
      expect(decision.suggestedUrl).toBe('https://wellfound.com/careers');
    });

    it('handles CAPTCHA_HUMAN_SOLVE response', async () => {
      const { complete } = await import('@careersignal/llm');
      (complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          verdict: 'problem',
          message: 'Captcha detected.',
          nextAction: 'CAPTCHA_HUMAN_SOLVE',
          cycleDelaySeconds: 30,
        }),
      );

      const decision = await runBrainAnalysis(makeContext({ pageType: 'captcha_challenge' }));
      expect(decision.nextAction).toBe('CAPTCHA_HUMAN_SOLVE');
    });

    it('handles LOGIN_WALL_HUMAN response', async () => {
      const { complete } = await import('@careersignal/llm');
      (complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          verdict: 'problem',
          message: 'Login required.',
          nextAction: 'LOGIN_WALL_HUMAN',
          cycleDelaySeconds: 20,
        }),
      );

      const decision = await runBrainAnalysis(makeContext({ pageType: 'login_wall' }));
      expect(decision.nextAction).toBe('LOGIN_WALL_HUMAN');
    });

    it('handles RETRY_EXTRACTION response with waitSeconds', async () => {
      const { complete } = await import('@careersignal/llm');
      (complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          verdict: 'problem',
          message: 'SPA not fully loaded.',
          nextAction: 'RETRY_EXTRACTION',
          waitSeconds: 12,
          cycleDelaySeconds: 15,
        }),
      );

      const decision = await runBrainAnalysis(
        makeContext({ jobsExtracted: 0, htmlCharCount: 3000 }),
      );
      expect(decision.nextAction).toBe('RETRY_EXTRACTION');
      expect(decision.waitSeconds).toBeGreaterThanOrEqual(5);
      expect(decision.waitSeconds).toBeLessThanOrEqual(20);
    });
  });

  describe('brainOrchestrate', () => {
    it('does not throw', () => {
      expect(() => brainOrchestrate('Test message')).not.toThrow();
    });

    it('accepts options', () => {
      expect(() =>
        brainOrchestrate('Test message', { phase: 'Extract', detail: 'some detail' }),
      ).not.toThrow();
    });
  });
});
