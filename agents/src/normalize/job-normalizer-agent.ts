/**
 * Job Normalizer Agent - Converts raw job extracts to canonical schema
 *
 * Responsibilities:
 * - Parse raw extracted fields
 * - Apply canonicalization rules
 * - Infer missing fields using LLM
 * - Validate output against schema
 *
 * LLM Usage: Medium (infer missing fields from description)
 */

import { complete } from '@careersignal/llm';
import type { RawJobListing } from '../browser/types.js';
import {
  type NormalizedJob,
  type SeniorityLevel,
  type RemoteType,
  type EmploymentType,
  type VisaSponsorship,
} from './types.js';
import { canonicalizeTitle, canonicalizeLocation } from './canonicalizer-agent.js';
import { generateDedupeKey } from './entity-resolver-agent.js';

export interface NormalizationResult {
  job: NormalizedJob;
  inferredFields: string[];
  confidence: number;
}

/** Row shape for job_listings_cache (no runId/sourceId). */
export interface JobCacheRow {
  blessedSourceId: string;
  title: string;
  companyName: string;
  sourceUrl: string;
  location?: string | null;
  remoteType?: string | null;
  seniority?: string | null;
  employmentType?: string | null;
  visaSponsorship?: string | null;
  description?: string | null;
  requirements?: string[] | null;
  postedDate?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  department?: string | null;
  team?: string | null;
  applyUrl?: string | null;
  rawExtract?: Record<string, unknown> | null;
  evidenceRefs?: string[] | null;
  confidence?: number | null;
  dedupeKey: string;
}

/**
 * Normalize a raw job listing for job_listings_cache (synchronous, no LLM).
 * Produces a row compatible with job_listings_cache schema.
 */
export function normalizeJobForCache(raw: RawJobListing, blessedSourceId: string): JobCacheRow {
  const title = canonicalizeTitle(raw.title);
  const companyName = raw.company?.trim() || 'Unknown Company';
  const sourceUrl = raw.url || raw.extractedFrom || '';
  const dedupeKey = generateDedupeKey(title, companyName);
  const location = raw.location ? canonicalizeLocation(raw.location) : undefined;
  const salary = parseSalary(raw.salary);

  return {
    blessedSourceId,
    title: title.substring(0, 512),
    companyName: companyName.substring(0, 255),
    sourceUrl: sourceUrl.substring(0, 2048) || sourceUrl,
    location: location?.substring(0, 255) ?? null,
    remoteType: null,
    seniority: null,
    employmentType: null,
    visaSponsorship: null,
    description: raw.description?.substring(0, 10000) ?? null,
    requirements: null,
    postedDate: raw.postedDate ?? null,
    salaryMin: salary.min ?? null,
    salaryMax: salary.max ?? null,
    salaryCurrency: salary.currency ?? null,
    department: null,
    team: null,
    applyUrl: raw.url ?? null,
    rawExtract: raw as unknown as Record<string, unknown>,
    evidenceRefs: [],
    confidence: raw.confidence,
    dedupeKey,
  };
}

/**
 * Normalize a raw job listing to canonical schema
 */
export async function normalizeJob(
  raw: RawJobListing,
  runId: string,
  sourceId: string,
): Promise<NormalizationResult> {
  const now = new Date().toISOString();
  const inferredFields: string[] = [];

  // Step 1: Parse and canonicalize known fields
  const title = canonicalizeTitle(raw.title);
  const location = raw.location ? canonicalizeLocation(raw.location) : undefined;

  // Step 2: Infer missing fields from description using LLM
  const inferred = raw.description
    ? await inferFieldsFromDescription(raw.description)
    : getDefaultInferences();

  if (inferred.seniority !== 'UNKNOWN') inferredFields.push('seniority');
  if (inferred.remoteType !== 'UNKNOWN') inferredFields.push('remoteType');
  if (inferred.visaSponsorship !== 'UNKNOWN') inferredFields.push('visaSponsorship');

  // Step 3: Parse salary if present
  const salary = parseSalary(raw.salary);

  // Step 4: Generate dedupe key
  const dedupeKey = generateDedupeKey(title, raw.company || '');

  const job: NormalizedJob = {
    id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    runId,
    sourceId,
    title,
    companyName: raw.company || 'Unknown Company',
    sourceUrl: raw.url || raw.extractedFrom,
    location,
    remoteType: inferred.remoteType,
    seniority: inferred.seniority,
    employmentType: inferred.employmentType,
    visaSponsorship: inferred.visaSponsorship,
    description: raw.description,
    requirements: inferred.requirements,
    postedDate: raw.postedDate,
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    applyUrl: raw.url,
    rawExtract: raw as unknown as Record<string, unknown>,
    evidenceRefs: [],
    confidence: raw.confidence,
    dedupeKey,
    createdAt: now,
    updatedAt: now,
  };

  return {
    job,
    inferredFields,
    confidence: calculateConfidence(job, inferredFields),
  };
}

interface InferredFields {
  seniority: SeniorityLevel;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  visaSponsorship: VisaSponsorship;
  requirements: string[];
}

async function inferFieldsFromDescription(description: string): Promise<InferredFields> {
  const truncated = description.substring(0, 3000);

  const prompt = `Analyze this job description and extract:
1. seniority: INTERN, JUNIOR, MID, SENIOR, STAFF, PRINCIPAL, DIRECTOR, VP, C_LEVEL, or UNKNOWN
2. remoteType: REMOTE, HYBRID, ONSITE, or UNKNOWN
3. employmentType: FULL_TIME, PART_TIME, CONTRACT, FREELANCE, INTERNSHIP, or UNKNOWN
4. visaSponsorship: YES (if mentions sponsorship), NO (if says "no sponsorship" or "must be authorized"), or UNKNOWN
5. requirements: Array of key requirements (max 5)

Job Description:
${truncated}

Return JSON: { seniority, remoteType, employmentType, visaSponsorship, requirements }`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 512,
      timeout: 30000,
    });

    const parsed = JSON.parse(response);
    return {
      seniority: parsed.seniority || 'UNKNOWN',
      remoteType: parsed.remoteType || 'UNKNOWN',
      employmentType: parsed.employmentType || 'UNKNOWN',
      visaSponsorship: parsed.visaSponsorship || 'UNKNOWN',
      requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
    };
  } catch {
    return getDefaultInferences();
  }
}

function getDefaultInferences(): InferredFields {
  return {
    seniority: 'UNKNOWN',
    remoteType: 'UNKNOWN',
    employmentType: 'UNKNOWN',
    visaSponsorship: 'UNKNOWN',
    requirements: [],
  };
}

function parseSalary(salaryStr?: string): { min?: number; max?: number; currency?: string } {
  if (!salaryStr) return {};

  // Extract numbers
  const numbers = salaryStr.match(/[\d,]+/g);
  if (!numbers) return {};

  const parsed = numbers.map((n) => parseInt(n.replace(/,/g, ''), 10));

  // Detect currency
  let currency = 'USD';
  if (salaryStr.includes('£')) currency = 'GBP';
  else if (salaryStr.includes('€')) currency = 'EUR';
  else if (salaryStr.includes('CAD')) currency = 'CAD';

  if (parsed.length >= 2) {
    return { min: Math.min(...parsed), max: Math.max(...parsed), currency };
  } else if (parsed.length === 1) {
    return { min: parsed[0], max: parsed[0], currency };
  }

  return {};
}

function calculateConfidence(job: NormalizedJob, inferredFields: string[]): number {
  let confidence = 0.5;

  // Boost for having key fields
  if (job.title) confidence += 0.1;
  if (job.companyName && job.companyName !== 'Unknown Company') confidence += 0.1;
  if (job.location) confidence += 0.1;
  if (job.description && job.description.length > 100) confidence += 0.1;

  // Slight penalty for inferred fields
  confidence -= inferredFields.length * 0.02;

  return Math.min(1, Math.max(0, confidence));
}
