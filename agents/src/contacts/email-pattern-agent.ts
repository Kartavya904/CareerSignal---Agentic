/**
 * Email-pattern agent: infer likely email format from company domain and person name.
 * Verification is passive only (e.g. MX check); no send/ping that could leak identity.
 */

export interface InferEmailPatternInput {
  companyDomain?: string | null;
  personName: string;
}

export interface InferEmailPatternResult {
  /** Inferred format description, e.g. "first.last@company.com" */
  format?: string;
  /** Candidate emails (1–3) to try */
  candidateEmails: string[];
  /** When domain unknown: generic variants (e.g. Gmail) */
  fallbackLinkedInSearchUrl?: string;
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').split(' ').filter(Boolean).join(' ');
}

function firstLast(name: string): { first: string; last: string } {
  const parts = slug(name).split(' ');
  const first = parts[0] ?? 'user';
  const last = parts.length > 1 ? parts[parts.length - 1]! : first;
  return { first, last };
}

/**
 * Infer likely email(s) for a person at a company.
 * When domain is unknown, returns empty candidateEmails and optional fallback LinkedIn search URL.
 */
export function inferEmailPattern(input: InferEmailPatternInput): InferEmailPatternResult {
  const { companyDomain, personName } = input;
  const result: InferEmailPatternResult = { candidateEmails: [] };

  if (!personName?.trim()) {
    return result;
  }

  const { first, last } = firstLast(personName);
  const domain = companyDomain?.replace(/^www\./, '').trim();
  if (!domain) {
    result.fallbackLinkedInSearchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(personName.trim())}`;
    return result;
  }

  const base = `${first}.${last}@${domain}`;
  result.candidateEmails = [
    `${first}.${last}@${domain}`,
    `${first}${last}@${domain}`,
    `${first.charAt(0)}${last}@${domain}`,
  ];
  result.format = `first.last@${domain}`;
  return result;
}
