import { and, desc, eq } from 'drizzle-orm';
import type { Db } from './client';
import { jobListings, companies } from './schema';

export type JobRemoteType = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';
export type JobStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export function normalizeJobDedupeKey(url: string): string {
  try {
    const u = new URL(url);
    return u.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.replace(/\/$/, '').toLowerCase();
  }
}

export interface InsertJobListingInput {
  companyId?: string | null;
  title: string;
  location?: string | null;
  remoteType?: JobRemoteType | null;
  employmentType?: string | null;
  level?: string | null;
  jobUrl?: string | null;
  applyUrl?: string | null;
  externalId?: string | null;
  descriptionText?: string | null;
  descriptionHtml?: string | null;
  postedAt?: Date | null;
  status?: JobStatus | null;
  dedupeKey: string;
  rawExtract?: Record<string, unknown> | null;
  evidencePaths?: string[] | null;
}

export async function getJobListingById(db: Db, id: string) {
  const [row] = await db.select().from(jobListings).where(eq(jobListings.id, id)).limit(1);
  return row ?? null;
}

export async function getJobListingByDedupeKey(db: Db, dedupeKey: string) {
  const [row] = await db
    .select()
    .from(jobListings)
    .where(eq(jobListings.dedupeKey, dedupeKey))
    .limit(1);
  return row ?? null;
}

export interface JobListingWithCompany {
  id: string;
  companyId: string | null;
  title: string;
  jobUrl: string | null;
  applyUrl: string | null;
  descriptionText: string | null;
  location: string | null;
  employmentType: string | null;
  status: string | null;
  companyName: string | null;
  companyWebsiteDomain: string | null;
}

/**
 * Get a job listing by apply URL (matches dedupe_key).
 * Joins company to return company name and website domain.
 */
export async function getJobListingByApplyUrl(
  db: Db,
  applyUrl: string,
): Promise<JobListingWithCompany | null> {
  const key = normalizeJobDedupeKey(applyUrl);
  const rows = await db
    .select({
      id: jobListings.id,
      companyId: jobListings.companyId,
      title: jobListings.title,
      jobUrl: jobListings.jobUrl,
      applyUrl: jobListings.applyUrl,
      descriptionText: jobListings.descriptionText,
      location: jobListings.location,
      employmentType: jobListings.employmentType,
      status: jobListings.status,
      companyName: companies.name,
      companyWebsiteDomain: companies.websiteDomain,
    })
    .from(jobListings)
    .leftJoin(companies, eq(jobListings.companyId, companies.id))
    .where(eq(jobListings.dedupeKey, key))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    jobUrl: row.jobUrl,
    applyUrl: row.applyUrl,
    descriptionText: row.descriptionText,
    location: row.location,
    employmentType: row.employmentType,
    status: row.status,
    companyName: row.companyName,
    companyWebsiteDomain: row.companyWebsiteDomain,
  };
}

export async function insertJobListing(db: Db, input: InsertJobListingInput) {
  const [row] = await db.insert(jobListings).values(input).returning();
  return row ?? null;
}

export async function upsertJobListingByDedupeKey(
  db: Db,
  input: InsertJobListingInput,
): Promise<{ id: string; created: boolean }> {
  const existing = await getJobListingByDedupeKey(db, input.dedupeKey);
  const now = new Date();

  if (existing) {
    await db
      .update(jobListings)
      .set({
        lastSeenAt: now,
        updatedAt: now,
        ...(input.title && { title: input.title }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.remoteType !== undefined && { remoteType: input.remoteType }),
        ...(input.employmentType !== undefined && { employmentType: input.employmentType }),
        ...(input.level !== undefined && { level: input.level }),
        ...(input.jobUrl !== undefined && { jobUrl: input.jobUrl }),
        ...(input.applyUrl !== undefined && { applyUrl: input.applyUrl }),
        ...(input.externalId !== undefined && { externalId: input.externalId }),
        ...(input.descriptionText !== undefined && { descriptionText: input.descriptionText }),
        ...(input.descriptionHtml !== undefined && { descriptionHtml: input.descriptionHtml }),
        ...(input.postedAt !== undefined && { postedAt: input.postedAt }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.rawExtract !== undefined && { rawExtract: input.rawExtract }),
        ...(input.evidencePaths !== undefined && { evidencePaths: input.evidencePaths }),
        ...(input.companyId !== undefined && { companyId: input.companyId }),
      })
      .where(eq(jobListings.id, existing.id));
    return { id: existing.id, created: false };
  }

  const [inserted] = await db
    .insert(jobListings)
    .values({ ...input, firstSeenAt: now, lastSeenAt: now })
    .returning({ id: jobListings.id });
  if (!inserted) throw new Error('Failed to insert job listing');
  return { id: inserted.id, created: true };
}

export async function listJobListings(
  db: Db,
  options?: { companyId?: string; status?: JobStatus; limit?: number; offset?: number },
) {
  const conditions = [];
  if (options?.companyId != null) conditions.push(eq(jobListings.companyId, options.companyId));
  if (options?.status != null) conditions.push(eq(jobListings.status, options.status));

  const baseQuery =
    conditions.length > 0
      ? db
          .select()
          .from(jobListings)
          .where(and(...conditions))
          .orderBy(desc(jobListings.lastSeenAt))
      : db.select().from(jobListings).orderBy(desc(jobListings.lastSeenAt));

  if (options?.limit != null) return baseQuery.limit(options.limit);
  if (options?.offset != null) return baseQuery.offset(options.offset);
  return baseQuery;
}

export interface JobListingWithCompanyRow {
  id: string;
  title: string;
  location: string | null;
  jobUrl: string | null;
  applyUrl: string | null;
  dedupeKey: string;
  status: string | null;
  companyName: string | null;
}

/** List recent job listings with company name for dashboard. */
export async function listJobListingsWithCompany(
  db: Db,
  options?: { status?: JobStatus; limit?: number },
): Promise<JobListingWithCompanyRow[]> {
  const limit = options?.limit ?? 30;
  const conditions = [];
  if (options?.status != null) conditions.push(eq(jobListings.status, options.status));
  const rows = await (conditions.length > 0
    ? db
        .select({
          id: jobListings.id,
          title: jobListings.title,
          location: jobListings.location,
          jobUrl: jobListings.jobUrl,
          applyUrl: jobListings.applyUrl,
          dedupeKey: jobListings.dedupeKey,
          status: jobListings.status,
          companyName: companies.name,
        })
        .from(jobListings)
        .leftJoin(companies, eq(jobListings.companyId, companies.id))
        .where(and(...conditions))
        .orderBy(desc(jobListings.lastSeenAt))
        .limit(limit)
    : db
        .select({
          id: jobListings.id,
          title: jobListings.title,
          location: jobListings.location,
          jobUrl: jobListings.jobUrl,
          applyUrl: jobListings.applyUrl,
          dedupeKey: jobListings.dedupeKey,
          status: jobListings.status,
          companyName: companies.name,
        })
        .from(jobListings)
        .leftJoin(companies, eq(jobListings.companyId, companies.id))
        .orderBy(desc(jobListings.lastSeenAt))
        .limit(limit));
  return rows as unknown as JobListingWithCompanyRow[];
}
