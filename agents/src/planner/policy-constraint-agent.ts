/**
 * Policy/Constraint Agent - Enforces user constraints, budgets, and allowlists
 *
 * Responsibilities:
 * - Rate limit enforcement per domain
 * - Budget tracking (time, tokens, pages)
 * - Allow/deny list checking
 * - Simulation mode enforcement
 *
 * LLM Usage: None (pure code logic)
 */

import { type PolicyConstraints, PolicyConstraintsSchema } from './types.js';

interface RateLimitState {
  domain: string;
  requestCount: number;
  windowStartMs: number;
}

interface BudgetState {
  tokensUsed: number;
  pagesVisited: number;
  startTimeMs: number;
}

export class PolicyConstraintAgent {
  private constraints: PolicyConstraints;
  private rateLimits: Map<string, RateLimitState> = new Map();
  private budget: BudgetState;

  constructor(constraints?: Partial<PolicyConstraints>) {
    this.constraints = PolicyConstraintsSchema.parse(constraints ?? {});
    this.budget = {
      tokensUsed: 0,
      pagesVisited: 0,
      startTimeMs: Date.now(),
    };
  }

  /**
   * Check if a domain is allowed
   */
  isDomainAllowed(domain: string): { allowed: boolean; reason?: string } {
    // Check blocked list
    if (this.constraints.blockedDomains?.includes(domain)) {
      return { allowed: false, reason: `Domain ${domain} is blocked` };
    }

    // Check allowed list (if specified, only allow listed domains)
    if (this.constraints.allowedDomains && this.constraints.allowedDomains.length > 0) {
      if (!this.constraints.allowedDomains.includes(domain)) {
        return { allowed: false, reason: `Domain ${domain} is not in allowed list` };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if rate limit allows a request
   */
  canMakeRequest(domain: string): { allowed: boolean; waitMs?: number } {
    const now = Date.now();
    const windowMs = 1000; // 1 second window

    let state = this.rateLimits.get(domain);

    if (!state || now - state.windowStartMs >= windowMs) {
      // Reset window
      state = { domain, requestCount: 0, windowStartMs: now };
      this.rateLimits.set(domain, state);
    }

    if (state.requestCount >= this.constraints.rateLimitPerDomain) {
      const waitMs = windowMs - (now - state.windowStartMs);
      return { allowed: false, waitMs };
    }

    return { allowed: true };
  }

  /**
   * Record a request (call after making request)
   */
  recordRequest(domain: string): void {
    const state = this.rateLimits.get(domain);
    if (state) {
      state.requestCount++;
    }
  }

  /**
   * Check if budget allows more operations
   */
  checkBudget(): { allowed: boolean; violations: string[] } {
    const violations: string[] = [];
    const elapsedMs = Date.now() - this.budget.startTimeMs;

    if (elapsedMs > this.constraints.maxTimePerRunMs) {
      violations.push(
        `Time budget exceeded: ${elapsedMs}ms > ${this.constraints.maxTimePerRunMs}ms`,
      );
    }

    if (this.budget.tokensUsed > this.constraints.maxTokensPerRun) {
      violations.push(
        `Token budget exceeded: ${this.budget.tokensUsed} > ${this.constraints.maxTokensPerRun}`,
      );
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * Record token usage
   */
  recordTokens(count: number): void {
    this.budget.tokensUsed += count;
  }

  /**
   * Record page visit
   */
  recordPageVisit(): void {
    this.budget.pagesVisited++;
  }

  /**
   * Check if simulation mode is enabled
   */
  isSimulationMode(): boolean {
    return this.constraints.simulationMode;
  }

  /**
   * Get current budget status
   */
  getBudgetStatus(): {
    tokensUsed: number;
    tokensRemaining: number;
    timeElapsedMs: number;
    timeRemainingMs: number;
    pagesVisited: number;
  } {
    const elapsedMs = Date.now() - this.budget.startTimeMs;
    return {
      tokensUsed: this.budget.tokensUsed,
      tokensRemaining: Math.max(0, this.constraints.maxTokensPerRun - this.budget.tokensUsed),
      timeElapsedMs: elapsedMs,
      timeRemainingMs: Math.max(0, this.constraints.maxTimePerRunMs - elapsedMs),
      pagesVisited: this.budget.pagesVisited,
    };
  }

  /**
   * Reset budget for new run
   */
  resetBudget(): void {
    this.budget = {
      tokensUsed: 0,
      pagesVisited: 0,
      startTimeMs: Date.now(),
    };
    this.rateLimits.clear();
  }
}
