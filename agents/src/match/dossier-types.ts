/**
 * Types and merge logic for the Deep Company Dossier running memory.
 * Used by the deep-company-research agent; implementation (disk) lives in apps/web.
 *
 * Field priority: MUST_HAVE → SHOULD_HAVE → NICE_TO_HAVE.
 * CORE_FIELDS is built in that order so the pipeline scrapes and fills from top to bottom.
 * Missing-field fallback searches and coverage reporting use this order.
 */

/** Must-have: essential for job matching and application (careers, remote, locations, sponsorship). */
export const FIELD_PRIORITY_MUST_HAVE = [
  'descriptionText',
  'industries',
  'headquartersAndOffices',
  'sizeRange',
  'careersPageUrl',
  'linkedInCompanyUrl',
  'remotePolicy',
  'workAuthorizationRequirements',
  'hiringLocations',
  'sponsorshipSignals',
] as const;

/** Should-have: important for interview prep and culture fit. */
export const FIELD_PRIORITY_SHOULD_HAVE = [
  'longCompanyDescription',
  'companyStage',
  'foundedYear',
  'benefitsHighlights',
  'missionStatement',
  'coreValues',
  'typicalHiringProcess',
  'interviewProcess',
  'interviewFormatHints',
  'applicationTipsFromCareersPage',
  'remoteFriendlyLocations',
  'hiringTrend',
] as const;

/** Nice-to-have: extra context (funding, salary, tech stack, layoffs). */
export const FIELD_PRIORITY_NICE_TO_HAVE = [
  'fundingStage',
  'publicCompany',
  'ticker',
  'salaryByLevel',
  'techStackHints',
  'jobCountOpen',
  'recentLayoffsOrRestructuring',
] as const;

export const FIELD_PRIORITY_TIERS = {
  mustHave: [...FIELD_PRIORITY_MUST_HAVE],
  shouldHave: [...FIELD_PRIORITY_SHOULD_HAVE],
  niceToHave: [...FIELD_PRIORITY_NICE_TO_HAVE],
} as const;

/** All fields in scrape order: must-have first, then should-have, then nice-to-have. */
export const CORE_FIELDS = [
  ...FIELD_PRIORITY_MUST_HAVE,
  ...FIELD_PRIORITY_SHOULD_HAVE,
  ...FIELD_PRIORITY_NICE_TO_HAVE,
] as const;

export type CoreField = (typeof CORE_FIELDS)[number];

export interface DossierMemoryField {
  value: unknown;
  confidence: number;
  sourceUrls: string[];
}

export interface DossierMemory {
  updatedAt: string;
  coverage: { ratio: number; missing: string[] };
  fields: Record<string, DossierMemoryField>;
  visitedUrls: string[];
  /** URLs actually returned by search (browser or API). Only these are used when set; no synthetic paths. */
  discoveredUrls?: string[];
  /** URLs to visit: one result per browser search (title contains company). */
  urlsToVisit?: string[];
  /** Fallback: one URL per missing field from "company + missing field" browser search (title contains company). Visited after urlsToVisit. */
  urlsToVisitMissingFields?: string[];
  lastExtractionByUrl?: Record<string, string>;
  /**
   * Priority order for scraping: agent must fill must-have first, then should-have, then nice-to-have.
   * Persisted so the run has an explicit record of what to prioritize.
   */
  fieldPriorityTiers?: {
    mustHave: string[];
    shouldHave: string[];
    niceToHave: string[];
  };
  /** All targeted search queries we've already tried (normalized strings). */
  targetedQueriesTried?: string[];
  /** URLs that have been fetched but failed or returned too little content to use. */
  failedUrls?: string[];
  /** How many times we've attempted targeted search for each core field (by name). */
  targetedAttemptsByField?: Record<string, number>;
}

export interface DossierRunMetadata {
  companyName: string;
  seedUrl?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  finalCoverage?: number | null;
  finalStatus?: string | null;
}

/**
 * Partial extraction result from a single page (same field names as draft; values can be null).
 */
export interface DossierPageExtraction {
  descriptionText?: string | null;
  longCompanyDescription?: string | null;
  industries?: string[] | null;
  headquartersAndOffices?: string | null;
  companyStage?: string | null;
  sizeRange?: string | null;
  foundedYear?: number | null;
  careersPageUrl?: string | null;
  linkedInCompanyUrl?: string | null;
  remotePolicy?: string | null;
  remoteFriendlyLocations?: string[] | null;
  sponsorshipSignals?: Record<string, unknown> | null;
  workAuthorizationRequirements?: string | null;
  hiringLocations?: string[] | null;
  benefitsHighlights?: string | null;
  fundingStage?: string | null;
  publicCompany?: boolean | null;
  ticker?: string | null;
  missionStatement?: string | null;
  coreValues?: string[] | null;
  typicalHiringProcess?: string | null;
  interviewProcess?: string | null;
  interviewFormatHints?: string[] | null;
  applicationTipsFromCareersPage?: string | null;
  salaryByLevel?: Record<string, unknown> | null;
  techStackHints?: string[] | null;
  jobCountOpen?: number | null;
  hiringTrend?: string | null;
  recentLayoffsOrRestructuring?: string | null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

/**
 * Strict "counts for coverage" check. Coverage must consider all CORE_FIELDS;
 * only real values count — empty objects and metadata-only sponsorshipSignals do not.
 * Use this for coverage ratio and missing list so reported coverage matches reality.
 */
export function hasValueForCoverage(value: unknown, field?: string): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  ) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return false;
    // sponsorshipSignals: only real H1B/visa evidence counts; run metadata alone does not.
    if (
      field === 'sponsorshipSignals' &&
      keys.every((k) => k === 'coreCoverage' || k === 'missingCoreFields')
    )
      return false;
  }
  return true;
}

/** Default confidence when extraction returns a non-null value (no LLM-reported confidence). */
const DEFAULT_FIELD_CONFIDENCE = 0.85;

/**
 * Merge a single-page extraction into running memory. Keeps higher-confidence value per field;
 * appends sourceUrl to sourceUrls. Updates coverage and visitedUrls.
 */
export function mergeExtractionIntoMemory(
  memory: DossierMemory,
  extraction: DossierPageExtraction,
  sourceUrl: string,
): DossierMemory {
  const next = { ...memory };
  next.visitedUrls = memory.visitedUrls.includes(sourceUrl)
    ? memory.visitedUrls
    : [...memory.visitedUrls, sourceUrl];
  next.lastExtractionByUrl = {
    ...memory.lastExtractionByUrl,
    [sourceUrl]: new Date().toISOString(),
  };
  next.fields = { ...memory.fields };

  for (const field of CORE_FIELDS) {
    const value = extraction[field];
    if (!hasValue(value)) continue;

    const confidence = DEFAULT_FIELD_CONFIDENCE;
    const existing = next.fields[field];
    if (existing && existing.confidence >= confidence) {
      if (!existing.sourceUrls.includes(sourceUrl)) {
        next.fields[field] = {
          ...existing,
          sourceUrls: [...existing.sourceUrls, sourceUrl],
        };
      }
      continue;
    }

    next.fields[field] = {
      value,
      confidence,
      sourceUrls: existing?.sourceUrls.includes(sourceUrl)
        ? existing.sourceUrls
        : [...(existing?.sourceUrls ?? []), sourceUrl],
    };
  }

  let present = 0;
  const missing: string[] = [];
  for (const field of CORE_FIELDS) {
    if (hasValueForCoverage(next.fields[field]?.value, field)) present++;
    else missing.push(field);
  }
  next.coverage = {
    ratio: present / CORE_FIELDS.length,
    missing,
  };
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * Create empty memory for a new run. Includes field priority tiers so the agent knows scrape order.
 */
export function createEmptyDossierMemory(): DossierMemory {
  return {
    updatedAt: new Date().toISOString(),
    coverage: { ratio: 0, missing: [...CORE_FIELDS] },
    fields: {},
    visitedUrls: [],
    lastExtractionByUrl: {},
    fieldPriorityTiers: {
      mustHave: [...FIELD_PRIORITY_MUST_HAVE],
      shouldHave: [...FIELD_PRIORITY_SHOULD_HAVE],
      niceToHave: [...FIELD_PRIORITY_NICE_TO_HAVE],
    },
    targetedQueriesTried: [],
    failedUrls: [],
    targetedAttemptsByField: {},
  };
}

/**
 * Result of running RAG on a single page (e.g. runCompanyPageRag). Used by the agent input callback.
 */
export interface DossierRagResult {
  focusedHtml: string | null;
  chunksCount: number;
  keptCount: number;
  error?: string;
}

export type DossierRunCompanyPageRag = (
  outputDir: string,
  html: string,
  onLog?: (msg: string) => void,
) => Promise<DossierRagResult>;

/**
 * Disk writer interface for the dossier agent. Implemented in apps/web/lib/dossier-disk.ts.
 */
export interface DossierDiskWriter {
  getRunFolderPath(folderName: string): string;
  getPageDir(folderName: string, urlSlug: string): string;
  ensureRunFolder(folderName: string): Promise<void>;
  writePageRawAndCleaned(
    folderName: string,
    urlSlug: string,
    rawHtml: string,
    cleanedHtml: string,
  ): Promise<void>;
  readMemory(folderName: string): Promise<DossierMemory | null>;
  writeMemory(folderName: string, memory: DossierMemory): Promise<void>;
  saveMetadata(folderName: string, metadata: DossierRunMetadata): Promise<void>;
}

/**
 * Produce a filesystem-safe slug from a URL for use as pages/<slug>/.
 */
export function urlToDossierSlug(url: string, index?: number): string {
  try {
    const u = new URL(url);
    let host = u.hostname.replace(/^www\./, '').toLowerCase();
    const pathPart = u.pathname
      .replace(/\/+/g, '-')
      .replace(/[^a-z0-9-]/gi, '')
      .slice(0, 30);
    const slug = pathPart ? `${host}-${pathPart}` : host;
    const safe = slug.replace(/[^a-z0-9-]/g, '') || 'page';
    return index !== undefined ? `${safe}-${index}` : safe;
  } catch {
    return index !== undefined ? `page-${index}` : 'page';
  }
}
