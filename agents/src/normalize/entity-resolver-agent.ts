/**
 * Entity Resolver Agent - Deduplicates jobs using fuzzy matching
 *
 * Responsibilities:
 * - Generate dedupe keys for jobs
 * - Find duplicate job listings
 * - Merge duplicate records (keep richer one)
 *
 * LLM Usage: Light (disambiguate edge cases like "Alphabet" vs "Google")
 */

import type { NormalizedJob, DedupeResult } from './types.js';

/**
 * Generate a dedupe key from title and company
 */
export function generateDedupeKey(title: string, company: string): string {
  const normalizedTitle = normalizeForDedupe(title);
  const normalizedCompany = normalizeForDedupe(company);
  return `${normalizedCompany}::${normalizedTitle}`;
}

/**
 * Normalize string for deduplication
 */
function normalizeForDedupe(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Calculate similarity between two strings (0-1)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeForDedupe(str1);
  const s2 = normalizeForDedupe(str2);

  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  // Jaccard similarity on character n-grams
  const ngrams1 = getNgrams(s1, 3);
  const ngrams2 = getNgrams(s2, 3);

  const intersection = new Set([...ngrams1].filter((x) => ngrams2.has(x)));
  const union = new Set([...ngrams1, ...ngrams2]);

  return intersection.size / union.size;
}

function getNgrams(str: string, n: number): Set<string> {
  const ngrams = new Set<string>();
  for (let i = 0; i <= str.length - n; i++) {
    ngrams.add(str.substring(i, i + n));
  }
  return ngrams;
}

/**
 * Find duplicates in a list of jobs
 */
export function findDuplicates(
  jobs: NormalizedJob[],
  similarityThreshold: number = 0.85,
): Map<string, NormalizedJob[]> {
  const duplicateGroups = new Map<string, NormalizedJob[]>();
  const processed = new Set<string>();

  for (let i = 0; i < jobs.length; i++) {
    if (processed.has(jobs[i].id)) continue;

    const group: NormalizedJob[] = [jobs[i]];
    processed.add(jobs[i].id);

    for (let j = i + 1; j < jobs.length; j++) {
      if (processed.has(jobs[j].id)) continue;

      const titleSimilarity = calculateSimilarity(jobs[i].title, jobs[j].title);
      const companySimilarity = calculateSimilarity(jobs[i].companyName, jobs[j].companyName);

      // Both title and company must be similar
      if (titleSimilarity >= similarityThreshold && companySimilarity >= similarityThreshold) {
        group.push(jobs[j]);
        processed.add(jobs[j].id);
      }
    }

    if (group.length > 1) {
      duplicateGroups.set(jobs[i].id, group);
    }
  }

  return duplicateGroups;
}

/**
 * Deduplicate jobs by merging duplicates
 */
export function deduplicateJobs(
  jobs: NormalizedJob[],
  similarityThreshold: number = 0.85,
): { jobs: NormalizedJob[]; result: DedupeResult } {
  const duplicateGroups = findDuplicates(jobs, similarityThreshold);
  const mergedIds = new Set<string>();
  const mergedPairs: DedupeResult['mergedPairs'] = [];
  const deduplicatedJobs: NormalizedJob[] = [];

  // Process duplicate groups
  for (const [primaryId, group] of duplicateGroups) {
    // Select the richest record as primary
    const primary = selectRichestRecord(group);

    for (const job of group) {
      if (job.id !== primary.id) {
        mergedIds.add(job.id);
        mergedPairs.push({
          kept: primary.id,
          merged: job.id,
          similarity: calculateSimilarity(
            `${primary.title} ${primary.companyName}`,
            `${job.title} ${job.companyName}`,
          ),
        });
      }
    }

    deduplicatedJobs.push(primary);
  }

  // Add non-duplicate jobs
  for (const job of jobs) {
    if (!mergedIds.has(job.id) && !duplicateGroups.has(job.id)) {
      deduplicatedJobs.push(job);
    }
  }

  return {
    jobs: deduplicatedJobs,
    result: {
      originalCount: jobs.length,
      deduplicatedCount: deduplicatedJobs.length,
      mergedPairs,
    },
  };
}

/**
 * Select the richest record from duplicates (most complete data)
 */
function selectRichestRecord(jobs: NormalizedJob[]): NormalizedJob {
  return jobs.reduce((richest, current) => {
    const richestScore = calculateRichnessScore(richest);
    const currentScore = calculateRichnessScore(current);
    return currentScore > richestScore ? current : richest;
  });
}

function calculateRichnessScore(job: NormalizedJob): number {
  let score = 0;

  if (job.description && job.description.length > 50) score += 3;
  if (job.location) score += 2;
  if (job.salaryMin || job.salaryMax) score += 2;
  if (job.seniority !== 'UNKNOWN') score += 1;
  if (job.remoteType !== 'UNKNOWN') score += 1;
  if (job.visaSponsorship !== 'UNKNOWN') score += 1;
  if (job.requirements.length > 0) score += 1;
  if (job.applyUrl) score += 1;

  return score;
}
