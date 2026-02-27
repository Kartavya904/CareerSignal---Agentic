import { eq, and, desc } from 'drizzle-orm';
import type { Db } from './client';
import { jobListings as jobListingsTable } from './schema';

export type JobRemoteType = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';
export type JobStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

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

export async function insertJobListing(db: Db, input: InsertJobListingInput) {
  const [row] = await db.insert(jobListingsTable).values(input).returning();
  return row ?? null;
}

export async function getJobListingById(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(jobListingsTable)
    .where(eq(jobListingsTable.id, id))
    .limit(1);
  return row ?? null;
}

export async function getJobListingByDedupeKey(db: Db, dedupeKey: string) {
  const [row] = await db
    .select()
    .from(jobListingsTable)
    .where(eq(jobListingsTable.dedupeKey, dedupeKey))
    .limit(1);
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
      .update(jobListingsTable)
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
      .where(eq(jobListingsTable.id, existing.id));
    return { id: existing.id, created: false };
  }
  const [inserted] = await db
    .insert(jobListingsTable)
    .values({ ...input, firstSeenAt: now, lastSeenAt: now })
    .returning({ id: jobListingsTable.id });
  if (!inserted) throw new Error('Failed to insert job listing');
  return { id: inserted.id, created: true };
}

export async function listJobListingsByCompanyId(
  db: Db,
  companyId: string,
  options?: { status?: JobStatus; limit?: number },
) {
  const conditions = [eq(jobListingsTable.companyId, companyId)];
  if (options?.status != null) conditions.push(eq(jobListingsTable.status, options.status));
  const baseQuery = db
    .select()
    .from(jobListingsTable)
    .where(and(...conditions))
    .orderBy(desc(jobListingsTable.lastSeenAt));
  if (options?.limit != null) return baseQuery.limit(options.limit);
  return baseQuery;
}

export async function listJobListings(
  db: Db,
  options?: { companyId?: string; status?: JobStatus; limit?: number; offset?: number },
) {
  const conditions = [];
  if (options?.companyId != null)
    conditions.push(eq(jobListingsTable.companyId, options.companyId));
  if (options?.status != null) conditions.push(eq(jobListingsTable.status, options.status));
  const baseQuery =
    conditions.length > 0
      ? db
          .select()
          .from(jobListingsTable)
          .where(and(...conditions))
          .orderBy(desc(jobListingsTable.lastSeenAt))
      : db.select().from(jobListingsTable).orderBy(desc(jobListingsTable.lastSeenAt));
  if (options?.limit != null) return baseQuery.limit(options.limit);
  if (options?.offset != null) return baseQuery.offset(options.offset);
  return baseQuery;
}
