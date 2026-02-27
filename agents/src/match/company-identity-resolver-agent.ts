/**
 * Company Identity Resolver Agent
 *
 * Multi-signal resolver that takes the extracted company name plus context
 * (URL, title, description, cleaned HTML) and decides on a canonical name,
 * aliases, confidence, and short evidence strings.
 *
 * This agent is DB-agnostic: it does NOT talk to Postgres directly. The
 * application layer can use canonicalName/aliases to look up or create
 * company rows in the companies table.
 */

import { calculateSimilarity } from '../normalize/entity-resolver-agent.js';

export interface CompanyIdentityInput {
  pageUrl: string;
  extractedCompany: string;
  jobTitle: string;
  jobDescription: string;
  cleanedHtml?: string;
}

export interface CompanyIdentityResolution {
  canonicalName: string;
  aliases: string[];
  confidence: number; // 0–1
  evidence: string[];
}

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+(inc|corp|co\.?|ltd|llc|gmbh|s\.a\.|s\.p\.a\.)\.?$/i, '')
    .trim();
}

function companyFromHost(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Strip common subdomains
    const parts = host.split('.');
    const core =
      parts.length > 2 && ['www', 'jobs', 'careers'].includes(parts[0]!)
        ? parts.slice(1, -1).join('.')
        : parts.slice(0, -1).join('.');
    if (!core) return null;
    // Heuristic: ignore generic ATS hosts (lever, greenhouse, etc.)
    if (
      core.includes('lever') ||
      core.includes('greenhouse') ||
      core.includes('ashby') ||
      core.includes('smartrecruiters') ||
      core.includes('workday') ||
      core.includes('jobvite') ||
      core.includes('icims')
    ) {
      return null;
    }
    return core
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return null;
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (!h || !n) return 0;
  let count = 0;
  let idx = h.indexOf(n);
  while (idx !== -1) {
    count++;
    idx = h.indexOf(n, idx + n.length);
  }
  return count;
}

/**
 * Resolve company identity from available signals. Favors the extracted
 * company name, but cross-checks with URL host and repetition in description.
 */
export function resolveCompanyIdentity(input: CompanyIdentityInput): CompanyIdentityResolution {
  const evidence: string[] = [];
  const variants = new Map<string, { score: number; reason: string[] }>();

  const descriptionText = input.jobDescription ?? '';
  const htmlText = input.cleanedHtml ?? '';
  const combined = `${descriptionText}\n${htmlText}`;

  const extracted = normalizeName(input.extractedCompany);
  if (extracted && extracted.toLowerCase() !== 'unknown') {
    const freq = countOccurrences(combined, extracted);
    const reason = [`Extractor: "${extracted}"`];
    if (freq > 0) reason.push(`Appears ${freq} times in description/HTML.`);
    variants.set(extracted, {
      score: 0.6 + Math.min(freq * 0.05, 0.3), // up to +0.3 from frequency
      reason,
    });
  }

  const hostCandidate = companyFromHost(input.pageUrl);
  if (hostCandidate) {
    const normHost = normalizeName(hostCandidate);
    const freq = countOccurrences(combined, normHost);
    const sim = extracted && normHost ? calculateSimilarity(extracted, normHost) : 0;
    const key = normHost;
    const existing = variants.get(key);
    const base = 0.5 + sim * 0.3 + Math.min(freq * 0.03, 0.2);
    const reason = [`From URL host: "${normHost}"`, `Similarity to extracted: ${sim.toFixed(2)}`];
    if (freq > 0) reason.push(`Appears ${freq} times in description/HTML.`);
    variants.set(key, {
      score: Math.max(existing?.score ?? 0, base),
      reason: existing ? existing.reason.concat(reason) : reason,
    });
  }

  // If we have both extracted and host candidates and they are very similar,
  // merge them under the extracted spelling.
  if (extracted && hostCandidate) {
    const normHost = normalizeName(hostCandidate);
    const sim = calculateSimilarity(extracted, normHost);
    if (sim >= 0.9 && variants.has(extracted) && variants.has(normHost)) {
      const hostVariant = variants.get(normHost)!;
      const extractedVariant = variants.get(extracted)!;
      variants.set(extracted, {
        score: Math.max(extractedVariant.score, hostVariant.score),
        reason: extractedVariant.reason.concat(hostVariant.reason),
      });
      variants.delete(normHost);
    }
  }

  // Fallback: if no variants at all, create one from extracted or host or page host slug.
  if (variants.size === 0) {
    const fallbackName = extracted || hostCandidate || 'Unknown Company';
    variants.set(fallbackName, {
      score: fallbackName === 'Unknown Company' ? 0.1 : 0.5,
      reason: ['Fallback from minimal signals.'],
    });
  }

  // Pick best-scoring variant
  const ranked = [...variants.entries()].sort((a, b) => b[1].score - a[1].score);
  const [canonicalName, bestMeta] = ranked[0]!;

  const aliases = ranked.map(([name]) => name).filter((name) => name !== canonicalName);

  const confidence = Math.max(0, Math.min(1, bestMeta.score));
  evidence.push(...bestMeta.reason);

  return {
    canonicalName,
    aliases,
    confidence,
    evidence,
  };
}
