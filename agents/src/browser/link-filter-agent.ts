/**
 * Link Filter Agent — Filters discovered URLs before enqueueing to the crawl frontier.
 *
 * Permissive by default: allows all same-domain links except obviously
 * non-job static/asset/auth paths. The crawler should explore aggressively
 * to find all job-related content.
 *
 * Code-only, no LLM. Deterministic and fast.
 */

export interface FilteredLink {
  url: string;
  depth: number;
  priority?: number;
}

export interface LinkFilterOptions {
  sourceDomain: string;
  urlSeen: Set<string>;
  frontier: Array<{ url: string }>;
  currentDepth: number;
  maxDepth: number;
}

/**
 * Paths that are definitely NOT job-related. Only block these exact prefixes.
 * We are permissive — if in doubt, let it through.
 */
const BLOCKLIST_EXACT_PREFIXES = [
  '/api/',
  '/static/',
  '/assets/',
  '/css/',
  '/js/',
  '/fonts/',
  '/images/',
  '/img/',
  '/media/',
  '/wp-content/',
  '/wp-admin/',
  '/feed/',
  '/rss/',
  '/.well-known/',
  '/cdn-cgi/',
  '/talent/_next/',
  '/_next/',
];

/**
 * Paths blocked only when they are the FULL path (not a subpath of something else).
 * e.g. /login is blocked, but /company/login-startup would NOT be.
 */
const BLOCKLIST_EXACT_PATHS = [
  '/login',
  '/signin',
  '/signup',
  '/register',
  '/auth',
  '/privacy',
  '/terms',
  '/robots.txt',
  '/sitemap.xml',
];

const EXTERNAL_ATS_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'workday.com',
  'icims.com',
  'smartrecruiters.com',
  'ashbyhq.com',
  'bamboohr.com',
  'breezy.hr',
  'recruitee.com',
  'workable.com',
  'jazz.co',
  'jobvite.com',
  'myworkdayjobs.com',
  'taleo.net',
  'successfactors.com',
];

/**
 * Normalize a URL for deduplication: strip fragment, sort query params,
 * remove trailing slash.
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.searchParams.sort();
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    u.pathname = pathname;
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Check if a URL is an external ATS apply link.
 */
export function isExternalApplyUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return EXTERNAL_ATS_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

/**
 * Filter candidate URLs. Returns same-domain, unseen URLs within depth cap.
 * Permissive: only blocks obviously non-content paths.
 */
export function filterLinks(candidateUrls: string[], options: LinkFilterOptions): FilteredLink[] {
  const { sourceDomain, urlSeen, frontier, currentDepth, maxDepth } = options;
  const nextDepth = currentDepth + 1;

  if (nextDepth > maxDepth) return [];

  const frontierUrls = new Set(frontier.map((f) => normalizeUrl(f.url)));
  const result: FilteredLink[] = [];
  const sourceDomainLower = sourceDomain.toLowerCase();

  for (const rawUrl of candidateUrls) {
    const normalized = normalizeUrl(rawUrl);

    if (urlSeen.has(normalized) || frontierUrls.has(normalized)) continue;

    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      continue;
    }

    const host = parsed.hostname.toLowerCase();
    if (!host.includes(sourceDomainLower) && !sourceDomainLower.includes(host)) {
      continue;
    }

    if (isExternalApplyUrl(normalized)) continue;

    const pathLower = parsed.pathname.toLowerCase();

    // Skip static/asset prefixes
    const isPrefixBlocked = BLOCKLIST_EXACT_PREFIXES.some((bp) => pathLower.startsWith(bp));
    if (isPrefixBlocked) continue;

    // Skip exact auth/legal paths (but not subpaths like /company/login-startup)
    const isExactBlocked = BLOCKLIST_EXACT_PATHS.some(
      (bp) => pathLower === bp || pathLower === bp + '/',
    );
    if (isExactBlocked) continue;

    // Skip file extensions that aren't pages
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json|xml)$/i.test(pathLower)) {
      continue;
    }

    result.push({ url: normalized, depth: nextDepth });
    frontierUrls.add(normalized);
  }

  return result;
}

/**
 * Extract all href values from HTML anchors.
 * Resolves relative URLs using the base URL.
 */
export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const hrefRegex = /<a\s[^>]*?href=["']([^"'#][^"']*)["'][^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = hrefRegex.exec(html)) !== null) {
    let href = m[1].trim();
    if (
      !href ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
    ) {
      continue;
    }

    try {
      const resolved = new URL(href, baseUrl).toString();
      if (!seen.has(resolved)) {
        seen.add(resolved);
        links.push(resolved);
      }
    } catch {
      continue;
    }
  }

  return links;
}
