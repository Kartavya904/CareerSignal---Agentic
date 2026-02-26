import { and, eq, desc, count } from 'drizzle-orm';
import type { Db } from './client';
import { companies as companiesTable, jobListings as jobListingsTable } from './schema';

export type EntityType = 'COMPANY' | 'SOURCE' | 'CONNECTOR_TEMPLATE' | 'RESOURCE';
export type AtsType =
  | 'GREENHOUSE'
  | 'LEVER'
  | 'ASHBY'
  | 'SMARTRECRUITERS'
  | 'RECRUITEE'
  | 'PERSONIO'
  | 'WORKDAY'
  | 'UNKNOWN';

export type TestBudget = {
  max_pages?: number;
  max_jobs?: number;
  timeout_ms?: number;
};

export interface InsertCompanyInput {
  type: EntityType;
  name: string;
  normalizedName: string;
  url: string;
  origin?: string | null;
  kind?: string | null;
  isPriorityTarget?: boolean;
  enabledForScraping?: boolean;
  parentCompanyId?: string | null;
  atsType?: AtsType | null;
  scrapeStrategy?: 'AUTO' | 'API_JSON' | 'API_XML' | 'BROWSER_FALLBACK' | null;
  connectorConfig?: Record<string, unknown> | null;
  websiteDomain?: string | null;
}

export type UpdateCompanyData = Partial<InsertCompanyInput> & {
  updatedAt?: Date;
  testBudget?: TestBudget | null;
  atsType?: AtsType | null;
  scrapeStrategy?: 'AUTO' | 'API_JSON' | 'API_XML' | 'BROWSER_FALLBACK' | null;
  connectorConfig?: Record<string, unknown> | null;
  lastFingerprintedAt?: Date | null;
  lastScrapedAt?: Date | null;
  lastStatus?: 'OK' | 'ERROR' | 'BLOCKED' | 'CAPTCHA' | 'LOGIN_WALL' | 'EMPTY' | 'SKIPPED' | null;
  lastError?: string | null;
  jobCountTotal?: number;
  jobCountOpen?: number;
};

export async function insertCompany(db: Db, input: InsertCompanyInput) {
  const [row] = await db.insert(companiesTable).values(input).returning();
  return row ?? null;
}

export async function getCompanyById(db: Db, id: string) {
  const [row] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
  return row ?? null;
}

export async function getCompanyByNormalizedName(db: Db, normalizedName: string) {
  const [row] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.normalizedName, normalizedName))
    .limit(1);
  return row ?? null;
}

export async function getCompanyByNormalizedNameAndType(
  db: Db,
  normalizedName: string,
  type: EntityType,
) {
  const [row] = await db
    .select()
    .from(companiesTable)
    .where(and(eq(companiesTable.normalizedName, normalizedName), eq(companiesTable.type, type)))
    .limit(1);
  return row ?? null;
}

export async function listCompanies(
  db: Db,
  options?: {
    type?: EntityType;
    isPriorityTarget?: boolean;
    enabledForScraping?: boolean;
    limit?: number;
    offset?: number;
  },
) {
  const conditions = [];
  if (options?.type != null) conditions.push(eq(companiesTable.type, options.type));
  if (options?.isPriorityTarget != null)
    conditions.push(eq(companiesTable.isPriorityTarget, options.isPriorityTarget));
  if (options?.enabledForScraping != null)
    conditions.push(eq(companiesTable.enabledForScraping, options.enabledForScraping));

  const baseQuery =
    conditions.length > 0
      ? db
          .select()
          .from(companiesTable)
          .where(and(...conditions))
          .orderBy(desc(companiesTable.updatedAt))
      : db.select().from(companiesTable).orderBy(desc(companiesTable.updatedAt));

  if (options?.limit != null) return baseQuery.limit(options.limit);
  if (options?.offset != null) return baseQuery.offset(options.offset);
  return baseQuery;
}

export async function updateCompany(db: Db, id: string, data: UpdateCompanyData) {
  const [row] = await db
    .update(companiesTable)
    .set({ ...data, updatedAt: data.updatedAt ?? new Date() })
    .where(eq(companiesTable.id, id))
    .returning();
  return row ?? null;
}

export async function upsertCompanyByNormalizedName(db: Db, input: InsertCompanyInput) {
  const existing = await getCompanyByNormalizedName(db, input.normalizedName);
  if (existing) {
    return updateCompany(db, existing.id, input);
  }
  return insertCompany(db, input);
}

/** Upsert by (normalizedName, type) so the same name can exist as COMPANY and RESOURCE (e.g. Indeed). */
export async function upsertCompanyByNormalizedNameAndType(
  db: Db,
  input: InsertCompanyInput,
): Promise<{ id: string; created: boolean }> {
  const existing = await getCompanyByNormalizedNameAndType(db, input.normalizedName, input.type);
  if (existing) {
    await updateCompany(db, existing.id, input);
    return { id: existing.id, created: false };
  }
  const row = await insertCompany(db, input);
  if (!row) throw new Error(`Failed to insert company ${input.name}`);
  return { id: row.id, created: true };
}

/** Recompute and update job_count_total and job_count_open for a company from job_listings. */
export async function refreshCompanyJobCounts(db: Db, companyId: string) {
  const [totalRow] = await db
    .select({ count: count() })
    .from(jobListingsTable)
    .where(eq(jobListingsTable.companyId, companyId));
  const [openRow] = await db
    .select({ count: count() })
    .from(jobListingsTable)
    .where(and(eq(jobListingsTable.companyId, companyId), eq(jobListingsTable.status, 'OPEN')));
  const total = Number(totalRow?.count ?? 0);
  const open = Number(openRow?.count ?? 0);
  await db
    .update(companiesTable)
    .set({ jobCountTotal: total, jobCountOpen: open, updatedAt: new Date() })
    .where(eq(companiesTable.id, companyId));
}
