/**
 * Types and merge logic for the Deep Company Dossier running memory.
 * Minimal schema: only fields we scrape and persist for Application Assistant / Outreach.
 *
 * Field priority: MUST_HAVE → SHOULD_HAVE → NICE_TO_HAVE.
 * CORE_FIELDS is built in that order. sponsorshipRate is filled by a single H1B search step.
 */

/** Must-have: description, careers, LinkedIn, HQ, remote, hiring locations. */
export const FIELD_PRIORITY_MUST_HAVE = [
  'descriptionText',
  'careersPageUrl',
  'linkedInCompanyUrl',
  'headquartersAndOffices',
  'remotePolicy',
  'hiringLocations',
] as const;

/** Should-have: hiring process (single field), founded year. */
export const FIELD_PRIORITY_SHOULD_HAVE = ['hiringProcessDescription', 'foundedYear'] as const;

/** Nice-to-have: tech stack (fill only if found, do not explicitly search). */
export const FIELD_PRIORITY_NICE_TO_HAVE = ['techStackHints'] as const;

export const FIELD_PRIORITY_TIERS = {
  mustHave: [...FIELD_PRIORITY_MUST_HAVE],
  shouldHave: [...FIELD_PRIORITY_SHOULD_HAVE],
  niceToHave: [...FIELD_PRIORITY_NICE_TO_HAVE],
} as const;

/** All fields in scrape order. sponsorshipRate is set by a dedicated H1B step, not from page extraction. */
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
  discoveredUrls?: string[];
  urlsToVisit?: string[];
  urlsToVisitMissingFields?: string[];
  lastExtractionByUrl?: Record<string, string>;
  fieldPriorityTiers?: {
    mustHave: string[];
    shouldHave: string[];
    niceToHave: string[];
  };
  targetedQueriesTried?: string[];
  failedUrls?: string[];
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

/** Partial extraction from a single page (minimal schema). */
export interface DossierPageExtraction {
  descriptionText?: string | null;
  headquartersAndOffices?: string | null;
  foundedYear?: number | null;
  careersPageUrl?: string | null;
  linkedInCompanyUrl?: string | null;
  remotePolicy?: string | null;
  hiringLocations?: string[] | null;
  hiringProcessDescription?: string | null;
  techStackHints?: string[] | null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

export function hasValueForCoverage(value: unknown, _field?: string): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  ) {
    if (Object.keys(value as Record<string, unknown>).length === 0) return false;
  }
  return true;
}

const DEFAULT_FIELD_CONFIDENCE = 0.85;

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
