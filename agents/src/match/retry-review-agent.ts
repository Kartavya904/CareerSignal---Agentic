/**
 * Retry Review Agent
 *
 * Decides whether a failed action should be retried and how.
 * Used by deep company research (and other flows) to avoid silent skips
 * and to use the right strategy (e.g. browser when fetch returns empty).
 */

export type RetryAction =
  | 'fetch_url'
  | 'fetch_url_fallback_path'
  | 'llm_extraction'
  | 'llm_targeted_extraction';

export type RetryMethod = 'fetch_retry' | 'browser' | 'llm_longer_timeout' | 'llm_smaller_context';

export interface RetryReviewInput {
  action: RetryAction;
  context: {
    url?: string;
    charCount?: number;
    hasBrowser?: boolean;
    errorMessage?: string;
    attempt?: number;
    maxRetries?: number;
  };
}

export interface RetryReviewResult {
  shouldRetry: boolean;
  method?: RetryMethod;
  reason?: string;
}

const MAX_FETCH_RETRIES_PER_URL = 1;
const MAX_BROWSER_RETRIES_PER_URL = 1;
const MAX_LLM_TARGETED_RETRIES = 1;

/**
 * Review a failed action and decide if/how to retry.
 * Keeps logic in one place so we don't skip valuable content.
 */
export function shouldRetry(input: RetryReviewInput): RetryReviewResult {
  const { action, context } = input;
  const attempt = context.attempt ?? 0;
  const hasBrowser = context.hasBrowser === true;
  const errorMessage = (context.errorMessage ?? '').toLowerCase();

  switch (action) {
    case 'fetch_url':
    case 'fetch_url_fallback_path': {
      // Fetch returned empty or very short content - often due to JS-only pages or bot blocking
      const emptyOrFail = (context.charCount ?? 0) < 500;
      if (!emptyOrFail) {
        return { shouldRetry: false, reason: 'Enough content already' };
      }
      // First try: retry with plain fetch once (transient network)
      if (attempt === 0 && (context.maxRetries ?? MAX_FETCH_RETRIES_PER_URL) > 0) {
        return {
          shouldRetry: true,
          method: 'fetch_retry',
          reason: 'Empty or short response; retry fetch once',
        };
      }
      // Second try: use browser so JS-rendered or bot-protected pages can load (once per URL)
      if (hasBrowser && attempt === 1) {
        return {
          shouldRetry: true,
          method: 'browser',
          reason: 'Fetch returned no content; try with browser',
        };
      }
      return { shouldRetry: false, reason: 'Max retries reached or no browser available' };
    }

    case 'llm_extraction': {
      const aborted = errorMessage.includes('abort') || errorMessage.includes('timeout');
      if (aborted && attempt < 1) {
        return {
          shouldRetry: true,
          method: 'llm_longer_timeout',
          reason: 'LLM call aborted/timed out; retry with longer timeout',
        };
      }
      return { shouldRetry: false };
    }

    case 'llm_targeted_extraction': {
      const aborted = errorMessage.includes('abort') || errorMessage.includes('timeout');
      if (aborted && attempt < (context.maxRetries ?? MAX_LLM_TARGETED_RETRIES)) {
        return {
          shouldRetry: true,
          method: 'llm_smaller_context',
          reason: 'Targeted extraction aborted; retry with smaller context and longer timeout',
        };
      }
      return { shouldRetry: false };
    }

    default:
      return { shouldRetry: false };
  }
}
