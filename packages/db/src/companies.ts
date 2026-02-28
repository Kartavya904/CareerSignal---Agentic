import { and, eq, ilike, or, sql } from 'drizzle-orm';
import type { Db } from './client';
import { companies, enrichmentStatusEnum, type CompanyRow, type EnrichmentStatus } from './schema';

/** Best-effort normalization for fuzzy company name matching. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Find a company by normalized name (exact match on normalized_name).
 */
export async function findCompanyByNormalizedName(
  db: Db,
  name: string,
): Promise<CompanyRow | null> {
  const normalized = normalizeCompanyName(name);
  const [row] = await db
    .select()
    .from(companies)
    .where(eq(companies.normalizedName, normalized))
    .limit(1);
  return (row as CompanyRow | undefined) ?? null;
}

/**
 * Find a company using a combination of normalized name and optional websiteDomain/url hints.
 *
 * - First tries normalized_name exact match.
 * - If a domain is provided, also tries matching by website_domain or url ILIKE '%domain%'.
 */
export async function findCompanyByNameOrDomain(
  db: Db,
  params: { name: string; websiteDomainHint?: string | null },
): Promise<CompanyRow | null> {
  const normalized = normalizeCompanyName(params.name);

  // Fast path: exact normalized_name match.
  const byName = await findCompanyByNormalizedName(db, params.name);
  if (byName) return byName;

  if (!params.websiteDomainHint) return null;

  const domain = params.websiteDomainHint.toLowerCase();
  const [row] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.type, 'COMPANY'),
        or(
          ilike(companies.websiteDomain, `%${domain}%`),
          ilike(companies.url, `%${domain}%`),
          // As a fallback, allow loose name match on companies.name for the same domain.
          and(
            ilike(companies.name, `%${params.name.slice(0, 16)}%`),
            ilike(companies.url, `%${domain}%`),
          ),
        ),
      ),
    )
    .orderBy(sql`"last_enriched_at" DESC NULLS LAST`)
    .limit(1);

  return (row as CompanyRow | undefined) ?? null;
}

/**
 * Decide whether a company record should be refreshed by the deep enrichment agent.
 *
 * Policy:
 * - Always refresh if enrichment_status is ERROR or PENDING/RUNNING (stuck/incomplete).
 * - Treat DONE as stale if last_enriched_at is older than STALE_DAYS.
 */
const COMPANY_STALE_DAYS = 30;

export function needsCompanyRefresh(row: CompanyRow): boolean {
  const status = row.enrichmentStatus as EnrichmentStatus | null;

  if (!status || status === 'ERROR') return true;
  if (status === 'PENDING' || status === 'RUNNING') return true;

  const last = row.lastEnrichedAt;
  if (!last) return true;

  const ageMs = Date.now() - last.getTime();
  const staleMs = COMPANY_STALE_DAYS * 24 * 60 * 60 * 1000;
  return ageMs > staleMs;
}

export interface UpsertCompanyEnrichmentInput {
  type?: CompanyRow['type'];
  name: string;
  normalizedName?: string;
  url?: string;
  origin?: string | null;
  websiteDomain?: string | null;
  descriptionText?: string | null;
  enrichmentSources?: CompanyRow['enrichmentSources'] | null;
  industries?: CompanyRow['industries'] | null;
  hqLocation?: string | null;
  sizeRange?: string | null;
  foundedYear?: number | null;
  fundingStage?: string | null;
  publicCompany?: boolean | null;
  ticker?: string | null;
  remotePolicy?: string | null;
  sponsorshipSignals?: CompanyRow['sponsorshipSignals'] | null;
  hiringLocations?: CompanyRow['hiringLocations'] | null;
  techStackHints?: CompanyRow['techStackHints'] | null;
  jobCountTotal?: number | null;
  jobCountOpen?: number | null;
  enrichmentStatus?: EnrichmentStatus;
}

/**
 * Upsert a COMPANY row for deep enrichment.
 *
 * - If a row already exists (by normalized_name), patch enrichment-related fields and timestamps.
 * - Otherwise, insert a new COMPANY row with sane defaults and enrichment metadata.
 */
export async function upsertCompanyEnrichment(
  db: Db,
  input: UpsertCompanyEnrichmentInput,
): Promise<CompanyRow> {
  const normalized = input.normalizedName ?? normalizeCompanyName(input.name);
  const existing = await findCompanyByNormalizedName(db, input.name);
  const now = new Date();

  const enrichmentStatus = input.enrichmentStatus ?? 'DONE';

  if (existing) {
    const update: Partial<CompanyRow> = {
      descriptionText: input.descriptionText ?? existing.descriptionText,
      enrichmentSources: input.enrichmentSources ?? existing.enrichmentSources,
      industries: input.industries ?? existing.industries,
      hqLocation: input.hqLocation ?? existing.hqLocation,
      sizeRange: input.sizeRange ?? existing.sizeRange,
      foundedYear: input.foundedYear ?? existing.foundedYear,
      fundingStage: input.fundingStage ?? existing.fundingStage,
      publicCompany:
        input.publicCompany !== undefined ? input.publicCompany : existing.publicCompany,
      ticker: input.ticker ?? existing.ticker,
      remotePolicy: input.remotePolicy ?? existing.remotePolicy,
      sponsorshipSignals: input.sponsorshipSignals ?? existing.sponsorshipSignals,
      hiringLocations: input.hiringLocations ?? existing.hiringLocations,
      techStackHints: input.techStackHints ?? existing.techStackHints,
      websiteDomain: input.websiteDomain ?? existing.websiteDomain,
      jobCountTotal: input.jobCountTotal ?? existing.jobCountTotal,
      jobCountOpen: input.jobCountOpen ?? existing.jobCountOpen,
      enrichmentStatus,
      lastEnrichedAt: now,
      updatedAt: now,
    };

    const [row] = await db
      .update(companies)
      .set(update)
      .where(eq(companies.id, existing.id))
      .returning();

    return row as CompanyRow;
  }

  const [inserted] = await db
    .insert(companies)
    .values({
      type: input.type ?? 'COMPANY',
      name: input.name,
      normalizedName: normalized,
      url: input.url ?? input.websiteDomain ?? '',
      origin: input.origin ?? null,
      kind: 'APPLICATION_ASSISTANT',
      isPriorityTarget: true,
      enabledForScraping: false,
      descriptionText: input.descriptionText ?? null,
      enrichmentSources: input.enrichmentSources ?? null,
      industries: input.industries ?? null,
      hqLocation: input.hqLocation ?? null,
      sizeRange: input.sizeRange ?? null,
      foundedYear: input.foundedYear ?? null,
      fundingStage: input.fundingStage ?? null,
      publicCompany: input.publicCompany ?? null,
      ticker: input.ticker ?? null,
      remotePolicy: input.remotePolicy ?? null,
      sponsorshipSignals: input.sponsorshipSignals ?? null,
      hiringLocations: input.hiringLocations ?? null,
      techStackHints: input.techStackHints ?? null,
      websiteDomain: input.websiteDomain ?? null,
      jobCountTotal: input.jobCountTotal ?? 0,
      jobCountOpen: input.jobCountOpen ?? 0,
      enrichmentStatus,
      lastEnrichedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return inserted as CompanyRow;
}

/**
 * Mark enrichment status for a company row (lightweight helper).
 */
export async function updateCompanyEnrichmentStatus(
  db: Db,
  companyId: string,
  status: EnrichmentStatus,
): Promise<void> {
  await db
    .update(companies)
    .set({
      enrichmentStatus: enrichmentStatusEnum.enumValues.includes(status) ? status : 'ERROR',
      lastEnrichedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
}
