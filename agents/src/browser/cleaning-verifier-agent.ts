/**
 * Cleaning Verifier Agent — compares raw vs cleaned HTML and flags potential data loss.
 *
 * For now this is rule-based (no LLM): it checks that key signals like titles,
 * headings, and common job-section markers are preserved, and computes a simple
 * coverage ratio between raw and cleaned text.
 */

import { parse } from 'node-html-parser';

export interface CleaningVerificationResult {
  /** Rough fraction of raw text tokens that still appear in cleaned output (0–1). */
  coverageRatio: number;
  /** Important phrases that were present in raw but missing in cleaned HTML. */
  lostSignals: string[];
  /** True when coverage or lostSignals suggest manual review is needed. */
  manualReviewRequired: boolean;
}

function extractText(html: string): string {
  try {
    const root = parse(html, { comment: false });
    return root.text.replace(/\s+/g, ' ').trim();
  } catch {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

function getHeadings(html: string): string[] {
  try {
    const root = parse(html, { comment: false });
    const hs = root.querySelectorAll('h1, h2, h3');
    return hs
      .map((el) => el.textContent ?? '')
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

const SIGNAL_PHRASES = [
  'responsibilities',
  'requirements',
  'qualifications',
  'about the role',
  'about the job',
  'about the team',
  'what you will do',
  "what you'll do",
  'what you will be doing',
  'compensation',
  'salary',
  'benefits',
  'location',
  'apply now',
];

function lowerIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Verify that cleaned HTML preserves key content from raw HTML.
 * Returns coverage ratio and a list of lost signals. Callers can use
 * manualReviewRequired to gate a "needs human review" flag.
 */
export function verifyCleaning(
  rawHtml: string,
  cleanedHtml: string,
  opts?: { coverageThreshold?: number },
): CleaningVerificationResult {
  const rawText = extractText(rawHtml);
  const cleanedText = extractText(cleanedHtml);

  if (!rawText || !cleanedText) {
    return {
      coverageRatio: 0,
      lostSignals: [],
      manualReviewRequired: true,
    };
  }

  const rawTokens = rawText
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
  const cleanedTokens = new Set(
    cleanedText
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3),
  );

  let shared = 0;
  for (const t of rawTokens) {
    if (cleanedTokens.has(t)) shared++;
  }
  const coverageRatio = rawTokens.length > 0 ? shared / rawTokens.length : 0;

  const lostSignals: string[] = [];

  // Headings: any h1/h2/h3 that disappears entirely is suspicious.
  const rawHeadings = getHeadings(rawHtml);
  for (const h of rawHeadings) {
    if (h.length < 4) continue;
    if (!lowerIncludes(cleanedText, h)) {
      lostSignals.push(`Heading lost: "${h.slice(0, 80)}"`);
    }
  }

  // Common section phrases: present in raw but absent in cleaned.
  for (const phrase of SIGNAL_PHRASES) {
    if (lowerIncludes(rawText, phrase) && !lowerIncludes(cleanedText, phrase)) {
      lostSignals.push(`Section marker lost: "${phrase}"`);
    }
  }

  // Determine whether manual review is needed.
  const threshold = opts?.coverageThreshold ?? 0.8;
  const manualReviewRequired = coverageRatio < threshold || lostSignals.length > 0;

  return {
    coverageRatio,
    lostSignals,
    manualReviewRequired,
  };
}
