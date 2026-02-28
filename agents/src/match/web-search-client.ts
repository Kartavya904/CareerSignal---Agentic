/**
 * Open-web search client for company research.
 * - searchWebViaBrowser: use a Playwright page to search DuckDuckGo (no API key, unlimited local).
 * - searchWeb: SerpAPI when SERPAPI_KEY is set (optional).
 * Callers use returned URLs to fetch and extract content.
 */

import type { Page } from 'playwright';

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
}

const DDG_HTML_BASE = 'https://html.duckduckgo.com/html/';
const BROWSER_SEARCH_TIMEOUT_MS = 25_000;
const DDG_WAIT_FOR_RESULTS_MS = 2500;

/** Try multiple known selectors for DuckDuckGo HTML result links (structure can change). */
const DDG_LINK_SELECTORS = [
  'a.result__a',
  'a.result__url',
  '.result__body a[href^="http"]',
  '.results_links a[href^="http"]',
  '.result a[href*="http"]',
];

/**
 * Extract organic result links from the currently loaded DuckDuckGo HTML results page.
 * Exported so tests can validate extraction against fixture HTML without live internet.
 */
export async function extractDuckDuckGoResultsFromPage(page: Page): Promise<SearchResult[]> {
  const results = await page.evaluate((selectors: string[]) => {
    const out: { url: string; title: string; snippet?: string }[] = [];
    let linkEls: NodeListOf<Element> | null = null;
    for (const sel of selectors) {
      linkEls = document.querySelectorAll(sel);
      if (linkEls.length > 0) break;
    }
    if (!linkEls || linkEls.length === 0) return out;

    const tryDecode = (s: string) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };

    linkEls.forEach((a) => {
      const anchor = a as HTMLAnchorElement;
      // Prefer anchor.href (already resolved/absolute in browser), but fall back to raw attribute.
      const raw = anchor.href ?? anchor.getAttribute('href') ?? '';
      if (!raw || raw.startsWith('javascript:')) return;

      try {
        // Resolve relative hrefs against current page URL
        const u = new URL(raw, window.location.href);

        // DuckDuckGo often uses redirect links like /l/?uddg=<encodedUrl>.
        if (u.hostname.endsWith('duckduckgo.com')) {
          if (u.pathname === '/l' || u.pathname === '/l/') {
            const uddg = u.searchParams.get('uddg');
            if (!uddg) return;
            const decodedOnce = tryDecode(uddg);
            const decoded = decodedOnce.includes('%') ? tryDecode(decodedOnce) : decodedOnce;
            if (!decoded.startsWith('http')) return;
            const finalUrl = new URL(decoded);
            if (finalUrl.protocol !== 'http:' && finalUrl.protocol !== 'https:') return;

            const title = (a.textContent ?? '').trim().slice(0, 300);
            const row =
              a.closest('.result') ?? a.closest('.result__body') ?? a.closest('[class*="result"]');
            let snippet = '';
            if (row) {
              const snip =
                row.querySelector('.result__snippet') ?? row.querySelector('[class*="snippet"]');
              if (snip) snippet = (snip.textContent ?? '').trim().slice(0, 500);
            }
            out.push({ url: finalUrl.toString(), title, snippet });
            return;
          }

          // Skip non-organic DuckDuckGo internal links (e.g. pagination, settings).
          return;
        }

        if (u.protocol !== 'http:' && u.protocol !== 'https:') return;

        const title = (a.textContent ?? '').trim().slice(0, 300);
        const row =
          a.closest('.result') ?? a.closest('.result__body') ?? a.closest('[class*="result"]');
        let snippet = '';
        if (row) {
          const snip =
            row.querySelector('.result__snippet') ?? row.querySelector('[class*="snippet"]');
          if (snip) snippet = (snip.textContent ?? '').trim().slice(0, 500);
        }
        out.push({ url: u.toString(), title, snippet });
      } catch {
        // skip invalid
      }
    });

    return out;
  }, DDG_LINK_SELECTORS);

  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.url.toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Run a single DuckDuckGo search via a Playwright page and return organic result links.
 * No API key; uses the HTML version of DuckDuckGo for stable scraping.
 * Tries multiple selectors and resolves DDG redirect URLs (/l/?uddg=...) when present.
 */
export async function searchWebViaBrowser(page: Page, query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const url = `${DDG_HTML_BASE}?q=${encodeURIComponent(q)}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: BROWSER_SEARCH_TIMEOUT_MS });
    await page.waitForTimeout(DDG_WAIT_FOR_RESULTS_MS);
    return await extractDuckDuckGoResultsFromPage(page);
  } catch {
    return [];
  }
}

const SERPAPI_BASE = 'https://serpapi.com/search';
const DEFAULT_NUM = 10;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Run a single Google search via SerpAPI and return organic result links.
 * Returns [] if SERPAPI_KEY is missing, request fails, or no organic results.
 */
export async function searchWeb(
  query: string,
  options?: { apiKey?: string; num?: number },
): Promise<SearchResult[]> {
  const apiKey = options?.apiKey ?? process.env.SERPAPI_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return [];
  }

  const params = new URLSearchParams({
    engine: 'google',
    q: query.trim(),
    api_key: apiKey.trim(),
    num: String(options?.num ?? DEFAULT_NUM),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${SERPAPI_BASE}?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      organic_results?: Array<{ link?: string; title?: string; snippet?: string }>;
      error?: string;
    };

    if (data.error) return [];
    const organic = data.organic_results;
    if (!Array.isArray(organic)) return [];

    const results: SearchResult[] = [];
    const seen = new Set<string>();

    for (const item of organic) {
      const link = item.link?.trim();
      if (!link || seen.has(link)) continue;
      try {
        const u = new URL(link);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        seen.add(link);
        results.push({
          url: link,
          title: item.title?.trim() ?? '',
          snippet: item.snippet?.trim(),
        });
      } catch {
        // skip invalid URLs
      }
    }
    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if the search API is configured (e.g. for fallback logic).
 */
export function isSearchConfigured(): boolean {
  const key = process.env.SERPAPI_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}
