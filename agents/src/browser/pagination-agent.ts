/**
 * Pagination Agent - Discovers and navigates through paginated content
 *
 * Responsibilities:
 * - Detect pagination controls (next button, page numbers, load more)
 * - Navigate through all available pages
 * - Handle infinite scroll patterns
 * - Respect page limits from policy constraints
 *
 * LLM Usage: None (pure DOM analysis)
 */

import type { PaginationInfo } from './types.js';

// Common selectors for pagination controls
const PAGINATION_SELECTORS = {
  nextButton: [
    'a[rel="next"]',
    'button[aria-label*="next" i]',
    'a[aria-label*="next" i]',
    '.pagination-next',
    '.next-page',
    '[class*="next"]',
    'a:contains("Next")',
    'button:contains("Next")',
  ],
  loadMore: [
    'button[class*="load-more" i]',
    'button[class*="loadmore" i]',
    'a[class*="load-more" i]',
    'button:contains("Load More")',
    'button:contains("Show More")',
    '[data-action="load-more"]',
  ],
  pageNumbers: [
    '.pagination a',
    '.pager a',
    '[class*="pagination"] a',
    'nav[aria-label*="pagination" i] a',
  ],
};

export interface PaginationConfig {
  maxPages: number;
  scrollDelay: number;
  loadMoreDelay: number;
}

const DEFAULT_CONFIG: PaginationConfig = {
  maxPages: 10,
  scrollDelay: 1000,
  loadMoreDelay: 2000,
};

/**
 * Detect pagination info from current page HTML
 */
export function detectPagination(html: string, currentUrl: string): PaginationInfo {
  // Simplified detection - full implementation would use proper DOM parsing

  const hasNextLink = PAGINATION_SELECTORS.nextButton.some(
    (selector) => html.includes('next') || html.includes('Next'),
  );

  const hasLoadMore = PAGINATION_SELECTORS.loadMore.some(
    (selector) =>
      html.toLowerCase().includes('load more') || html.toLowerCase().includes('show more'),
  );

  return {
    currentPage: 1,
    hasNextPage: hasNextLink || hasLoadMore,
    loadMoreSelector: hasLoadMore ? 'button[class*="load"]' : undefined,
  };
}

/**
 * Get all page URLs from pagination
 */
export function extractPageUrls(html: string, baseUrl: string): string[] {
  // Placeholder - would extract all page number links
  const urls: string[] = [];

  // Common patterns: ?page=N, /page/N, &start=N
  // This would be implemented with proper DOM parsing

  return urls;
}

/**
 * Determine optimal pagination strategy
 */
export function getPaginationStrategy(
  paginationInfo: PaginationInfo,
): 'click_next' | 'click_load_more' | 'infinite_scroll' | 'url_pattern' | 'none' {
  if (paginationInfo.loadMoreSelector) {
    return 'click_load_more';
  }

  if (paginationInfo.nextPageSelector || paginationInfo.nextPageUrl) {
    return 'click_next';
  }

  if (paginationInfo.hasNextPage) {
    return 'url_pattern';
  }

  return 'none';
}

/**
 * Generate next page URL from pattern
 */
export function generateNextPageUrl(currentUrl: string, currentPage: number): string | null {
  // Common patterns
  const url = new URL(currentUrl);

  // Pattern 1: ?page=N
  if (url.searchParams.has('page')) {
    url.searchParams.set('page', String(currentPage + 1));
    return url.toString();
  }

  // Pattern 2: ?start=N (offset-based)
  if (url.searchParams.has('start')) {
    const start = parseInt(url.searchParams.get('start') || '0', 10);
    url.searchParams.set('start', String(start + 25)); // Assume 25 per page
    return url.toString();
  }

  // Pattern 3: /page/N in path
  if (url.pathname.includes('/page/')) {
    url.pathname = url.pathname.replace(/\/page\/\d+/, `/page/${currentPage + 1}`);
    return url.toString();
  }

  // Try adding page parameter
  url.searchParams.set('page', String(currentPage + 1));
  return url.toString();
}
