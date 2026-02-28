/**
 * Types and merge logic for the Deep Company Dossier running memory.
 * Used by the deep-company-research agent; implementation (disk) lives in apps/web.
 */

export const CORE_FIELDS = [
  'descriptionText',
  'industries',
  'hqLocation',
  'sizeRange',
  'foundedYear',
  'fundingStage',
  'publicCompany',
  'ticker',
  'remotePolicy',
  'sponsorshipSignals',
  'hiringLocations',
  'techStackHints',
  'jobCountOpen',
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
  industries?: string[] | null;
  hqLocation?: string | null;
  sizeRange?: string | null;
  foundedYear?: number | null;
  fundingStage?: string | null;
  publicCompany?: boolean | null;
  ticker?: string | null;
  remotePolicy?: string | null;
  sponsorshipSignals?: Record<string, unknown> | null;
  hiringLocations?: string[] | null;
  techStackHints?: string[] | null;
  jobCountOpen?: number | null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
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
    if (hasValue(next.fields[field]?.value)) present++;
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
 * Create empty memory for a new run.
 */
export function createEmptyDossierMemory(): DossierMemory {
  return {
    updatedAt: new Date().toISOString(),
    coverage: { ratio: 0, missing: [...CORE_FIELDS] },
    fields: {},
    visitedUrls: [],
    lastExtractionByUrl: {},
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
