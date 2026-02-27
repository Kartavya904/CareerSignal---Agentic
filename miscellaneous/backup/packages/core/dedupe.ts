/**
 * Dedupe key computation for job_listings. Primary: normalized apply_url.
 * Used by connectors to produce a stable dedupe_key before upsert.
 */

/**
 * Normalize URL for dedupe: lowercase, strip tracking params (utm_*), strip trailing slash, sort query params.
 */
export function normalizeUrlForDedupe(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.protocol = 'https:';
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const searchParams = new URLSearchParams();
    for (const [k, v] of parsed.searchParams) {
      if (k.toLowerCase().startsWith('utm_')) continue;
      searchParams.set(k, v);
    }
    const sorted = Array.from(searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    parsed.search = sorted.length ? '?' + new URLSearchParams(sorted).toString() : '';
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Compute dedupe_key for a job. Prefer apply_url, then job_url, then external_id prefix, then hash fallback.
 */
export function computeDedupeKey(options: {
  applyUrl?: string | null;
  jobUrl?: string | null;
  externalId?: string | null;
  sourcePrefix?: string; // e.g. 'gh' for Greenhouse
}): string {
  if (options.applyUrl?.trim()) {
    return normalizeUrlForDedupe(options.applyUrl.trim());
  }
  if (options.jobUrl?.trim()) {
    return normalizeUrlForDedupe(options.jobUrl.trim());
  }
  if (options.externalId != null && options.sourcePrefix) {
    return `${options.sourcePrefix}:${String(options.externalId)}`;
  }
  // Last resort: hash of something unique (caller can pass title+company+location if needed)
  return `hash:${simpleHash(JSON.stringify(options))}`;
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}
