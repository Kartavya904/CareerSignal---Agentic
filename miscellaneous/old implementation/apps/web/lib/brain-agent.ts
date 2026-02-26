/**
 * Brain Agent - LLM-Assisted Orchestrator for the scraper pipeline.
 *
 * Brain executes the Planner's action, uses LLM to validate outcomes,
 * and decides adaptations (RETRY_EXTRACTION, TRY_NEW_URL, CAPTCHA_HUMAN_SOLVE,
 * LOGIN_WALL_HUMAN, RETRY_CYCLE_SOON).
 *
 * Planner and Brain are in constant contact every step:
 *   Planner → action → Brain → execute + LLM validate + set adaptation → state update → Planner
 *
 * Uses REASONING model for analysis; orchestration logs are direct (no LLM).
 */

import { complete } from '@careersignal/llm';
import { brainLog } from './brain-logs';

export type BrainNextAction =
  | 'RETRY_EXTRACTION'
  | 'TRY_NEW_URL'
  | 'CAPTCHA_HUMAN_SOLVE'
  | 'LOGIN_WALL_HUMAN'
  | 'CONTINUE'
  | 'RETRY_CYCLE_SOON';

export interface BrainContext {
  sourceName: string;
  sourceUrl: string;
  sourceSlug: string | null;
  jobsExtracted: number;
  validationPassed: boolean;
  validationMessage?: string;
  recentLogSnippet: string;
  htmlCharCount?: number;
  cycleNumber: number;
  extractionStrategy?: string;
  attemptNumber?: number;
  captureHistory?: string;
  pageType?: string;
  depth?: number;
  frontierSize?: number;
  urlCorrectionAttempts?: number;
}

export interface BrainDecision {
  verdict: 'ok' | 'problem';
  message: string;
  diagnosis?: string;
  userRecommendation?: string;
  nextAction: BrainNextAction;
  suggestedUrl?: string;
  waitSeconds?: number;
  cycleDelaySeconds?: number;
}

const SYSTEM_PROMPT = `You are the Brain — the LLM-assisted orchestrator of a job scraping system. You execute plans from the Planner and validate outcomes.

Your role:
1. DIAGNOSE: Analyze scrape results. What went wrong? Why 0 jobs? Is the URL wrong? Blocked? SPA not loaded? Login required?
2. RECOMMEND: Tell the human operator exactly what to do.
3. DECIDE: Choose the next action. NEVER skip sources — we must extract jobs.
   - RETRY_EXTRACTION: When HTML is small (<5000 chars) or 0 jobs — SPA may need more load time. Specify waitSeconds: 10-15.
   - TRY_NEW_URL: Current URL is wrong; suggest alternative
   - CAPTCHA_HUMAN_SOLVE: Real captcha is likely (blocked page, challenge prompt). We will open a visible browser for the admin to solve it.
   - LOGIN_WALL_HUMAN: Page requires login. We will open a visible browser for the admin to log in manually.
   - CONTINUE: Success or acceptable partial; proceed
   - RETRY_CYCLE_SOON: Transient failure; retry in next cycle (cycleDelaySeconds: 10-30, max 60)

NEVER use SKIP_SOURCE. If blocked by captcha, use CAPTCHA_HUMAN_SOLVE. If login required, use LOGIN_WALL_HUMAN.

IMPORTANT: HTML captures are saved to disk with type classification (listing, company_careers, detail, login_wall, captcha_challenge, etc.).
- Only recommend LOGIN_WALL_HUMAN when page type is login_wall. If the page is classified as listing or company_careers, the page is NOT a login wall — use CONTINUE or RETRY_EXTRACTION for 0 jobs (extraction/selector issue), not login.
- Only recommend CAPTCHA_HUMAN_SOLVE when page type is captcha_challenge.
- Ignore "loginRequired" from the validator when page type is listing/company_careers; many sites show "Sign in" in the nav on normal pages.

Be thorough. Give a clear diagnosis and concrete user recommendation. Output JSON only.`;

/**
 * Log orchestration decisions (no LLM) — Brain declaring what it's doing.
 */
export function brainOrchestrate(
  message: string,
  options?: { phase?: string; detail?: string },
): void {
  brainLog(`[Orchestrator] ${message}`, {
    level: 'insight',
    recommendation: options?.phase ?? options?.detail,
  });
}

/**
 * Brain analyzes scrape result and decides next action.
 */
export async function runBrainAnalysis(ctx: BrainContext): Promise<BrainDecision> {
  const prompt = `You are the Brain orchestrator. Analyze this scrape result and decide the next action.

Source: ${ctx.sourceName}
URL: ${ctx.sourceUrl}
Slug: ${ctx.sourceSlug ?? 'none'}
Jobs extracted: ${ctx.jobsExtracted}
Validation passed: ${ctx.validationPassed}${ctx.validationMessage ? ` (${ctx.validationMessage})` : ''}
${ctx.htmlCharCount != null ? `HTML captured: ${ctx.htmlCharCount} chars` : ''}
${ctx.pageType ? `Page type: ${ctx.pageType}` : ''}
${ctx.depth != null ? `Depth: ${ctx.depth}` : ''}
${ctx.frontierSize != null ? `Frontier size: ${ctx.frontierSize}` : ''}
${ctx.urlCorrectionAttempts != null ? `URL correction attempts: ${ctx.urlCorrectionAttempts}` : ''}
Cycle: ${ctx.cycleNumber}${ctx.attemptNumber != null ? `, attempt ${ctx.attemptNumber}` : ''}
${ctx.extractionStrategy ? `Extraction strategy used: ${ctx.extractionStrategy}` : ''}
${ctx.captureHistory ? `\nCapture history (saved HTML snapshots):\n${ctx.captureHistory}` : ''}

Recent agent logs:
${ctx.recentLogSnippet}

Respond with JSON:
{
  "verdict": "ok" | "problem",
  "message": "1–2 sentence summary",
  "diagnosis": "Full description of what happened and why (2–4 sentences).",
  "userRecommendation": "What the human operator should do.",
  "nextAction": "RETRY_EXTRACTION" | "TRY_NEW_URL" | "CAPTCHA_HUMAN_SOLVE" | "LOGIN_WALL_HUMAN" | "CONTINUE" | "RETRY_CYCLE_SOON",
  "suggestedUrl": "Alternative URL if nextAction is TRY_NEW_URL (optional)",
  "waitSeconds": number if nextAction is RETRY_EXTRACTION (8–15),
  "cycleDelaySeconds": number (10–60)
}`;

  try {
    const response = await complete(prompt, 'REASONING', {
      system: SYSTEM_PROMPT,
      format: 'json',
      temperature: 0.1,
      maxTokens: 768,
      timeout: 90000,
    });

    const parsed = JSON.parse(response) as Record<string, unknown>;
    const verdict = (parsed.verdict === 'problem' ? 'problem' : 'ok') as 'ok' | 'problem';
    const message = (parsed.message as string) ?? 'No analysis';
    const diagnosis = parsed.diagnosis as string | undefined;
    const userRecommendation = parsed.userRecommendation as string | undefined;
    const nextActionRaw = (parsed.nextAction as string) ?? 'CONTINUE';
    const validActions: BrainNextAction[] = [
      'RETRY_EXTRACTION',
      'TRY_NEW_URL',
      'CAPTCHA_HUMAN_SOLVE',
      'LOGIN_WALL_HUMAN',
      'CONTINUE',
      'RETRY_CYCLE_SOON',
    ];
    const nextAction: BrainNextAction = validActions.includes(nextActionRaw as BrainNextAction)
      ? (nextActionRaw as BrainNextAction)
      : 'CONTINUE';
    const suggestedUrl = parsed.suggestedUrl as string | undefined;
    const waitSeconds =
      typeof parsed.waitSeconds === 'number' ? Math.max(5, Math.min(20, parsed.waitSeconds)) : 10;
    const cycleDelaySeconds =
      typeof parsed.cycleDelaySeconds === 'number'
        ? Math.max(10, Math.min(60, parsed.cycleDelaySeconds))
        : 10;

    const decision: BrainDecision = {
      verdict,
      message,
      diagnosis,
      userRecommendation,
      nextAction,
      suggestedUrl: suggestedUrl && suggestedUrl.startsWith('http') ? suggestedUrl : undefined,
      waitSeconds: nextAction === 'RETRY_EXTRACTION' ? waitSeconds : undefined,
      cycleDelaySeconds,
    };

    brainLog(message, {
      level: verdict === 'problem' ? 'warn' : 'ok',
      recommendation: userRecommendation,
      reasoning: diagnosis,
      suggestedUrl: decision.suggestedUrl,
      cycleDelaySeconds: decision.cycleDelaySeconds,
    });

    return decision;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    brainLog(`Brain analysis failed: ${msg}. Defaulting to CONTINUE.`, { level: 'error' });
    return {
      verdict: 'ok',
      message: 'Brain unavailable; continuing with defaults',
      nextAction: 'CONTINUE',
      cycleDelaySeconds: 10,
    };
  }
}
