/**
 * ATS fingerprinting: detect which ATS a company uses from its careers URL.
 * Phase 7: URL pattern matching only (no HTTP). Phase 7+ can add HTTP probe / HTML inspection.
 */

export type AtsType =
  | 'GREENHOUSE'
  | 'LEVER'
  | 'ASHBY'
  | 'SMARTRECRUITERS'
  | 'RECRUITEE'
  | 'PERSONIO'
  | 'WORKDAY'
  | 'UNKNOWN';

export type ScrapeStrategy = 'AUTO' | 'API_JSON' | 'API_XML' | 'BROWSER_FALLBACK';

export interface FingerprintResult {
  atsType: AtsType;
  scrapeStrategy: ScrapeStrategy;
  connectorConfig: Record<string, unknown> | null;
}

function parseUrl(url: string): URL | null {
  try {
    const s = url.trim();
    const withProtocol = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

/**
 * Detect ATS from careers URL using URL pattern matching only.
 * Returns UNKNOWN if no pattern matches; connectorConfig contains extracted tokens (e.g. boardToken for Greenhouse).
 */
export function fingerprintFromUrl(careersUrl: string): FingerprintResult {
  const url = parseUrl(careersUrl);
  if (!url) {
    return { atsType: 'UNKNOWN', scrapeStrategy: 'AUTO', connectorConfig: null };
  }

  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  // Greenhouse: boards.greenhouse.io/BOARD or *.greenhouse.io (e.g. company.greenhouse.io)
  if (host === 'boards.greenhouse.io' && pathname !== '/') {
    const boardToken = pathname.split('/').filter(Boolean)[0];
    return {
      atsType: 'GREENHOUSE',
      scrapeStrategy: 'API_JSON',
      connectorConfig: boardToken ? { boardToken } : null,
    };
  }
  if (host.endsWith('.greenhouse.io')) {
    const boardToken = host.slice(0, -'.greenhouse.io'.length);
    return {
      atsType: 'GREENHOUSE',
      scrapeStrategy: 'API_JSON',
      connectorConfig: boardToken ? { boardToken } : null,
    };
  }

  // Lever: jobs.lever.co/COMPANY
  if (host === 'jobs.lever.co') {
    const parts = pathname.split('/').filter(Boolean);
    const companySlug = parts[0] || undefined;
    return {
      atsType: 'LEVER',
      scrapeStrategy: 'API_JSON',
      connectorConfig: companySlug ? { companySlug } : null,
    };
  }

  // Ashby: jobs.ashbyhq.com or *.ashbyhq.com
  if (host === 'jobs.ashbyhq.com') {
    const parts = pathname.split('/').filter(Boolean);
    const companySlug = parts[0] || undefined;
    return {
      atsType: 'ASHBY',
      scrapeStrategy: 'API_JSON',
      connectorConfig: companySlug ? { companySlug } : null,
    };
  }
  if (host.endsWith('.ashbyhq.com')) {
    const parts = pathname.split('/').filter(Boolean);
    const companySlug = parts[0] || undefined;
    return {
      atsType: 'ASHBY',
      scrapeStrategy: 'API_JSON',
      connectorConfig: companySlug ? { companySlug } : null,
    };
  }

  // SmartRecruiters: *.smartrecruiters.com
  if (host.endsWith('.smartrecruiters.com')) {
    return { atsType: 'SMARTRECRUITERS', scrapeStrategy: 'API_JSON', connectorConfig: null };
  }

  // Recruitee: *.recruitee.com
  if (host.endsWith('.recruitee.com')) {
    return { atsType: 'RECRUITEE', scrapeStrategy: 'API_JSON', connectorConfig: null };
  }

  // Personio: *.jobs.personio.de
  if (host.endsWith('.jobs.personio.de')) {
    return { atsType: 'PERSONIO', scrapeStrategy: 'API_JSON', connectorConfig: null };
  }

  // Workday: *.myworkdayjobs.com or *.wdN.myworkdayjobs.com
  if (host.endsWith('.myworkdayjobs.com')) {
    return { atsType: 'WORKDAY', scrapeStrategy: 'API_XML', connectorConfig: null };
  }
  if (/\.wd[1-5]\.myworkdayjobs\.com$/i.test(host)) {
    return { atsType: 'WORKDAY', scrapeStrategy: 'API_XML', connectorConfig: null };
  }

  return { atsType: 'UNKNOWN', scrapeStrategy: 'AUTO', connectorConfig: null };
}
