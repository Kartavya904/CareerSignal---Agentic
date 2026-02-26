import { eq, and, desc, count } from 'drizzle-orm';
import type { Db } from './client';
import { jobListingsCache } from './schema';

export interface JobCacheInsert {
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
  postedDate?: Date | string | null;
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

/** Upsert a job into job_listings_cache by (blessed_source_id, dedupe_key). */
export async function upsertJobListingCache(db: Db, row: JobCacheInsert): Promise<void> {
  const now = new Date();
  const postedDate = row.postedDate
    ? typeof row.postedDate === 'string'
      ? safeParseDate(row.postedDate)
      : row.postedDate.toISOString().slice(0, 10)
    : null;
  const base = {
    blessedSourceId: row.blessedSourceId,
    title: row.title,
    companyName: row.companyName,
    sourceUrl: row.sourceUrl,
    location: row.location ?? null,
    description: row.description ?? null,
    requirements: row.requirements ?? null,
    postedDate,
    salaryMin: row.salaryMin != null ? String(row.salaryMin) : null,
    salaryMax: row.salaryMax != null ? String(row.salaryMax) : null,
    salaryCurrency: row.salaryCurrency ?? null,
    department: row.department ?? null,
    team: row.team ?? null,
    applyUrl: row.applyUrl ?? null,
    rawExtract: row.rawExtract ?? null,
    evidenceRefs: row.evidenceRefs ?? null,
    confidence: row.confidence != null ? String(row.confidence) : null,
    dedupeKey: row.dedupeKey,
    lastSeenAt: now,
    updatedAt: now,
  };

  const existing = await db
    .select()
    .from(jobListingsCache)
    .where(
      and(
        eq(jobListingsCache.blessedSourceId, row.blessedSourceId),
        eq(jobListingsCache.dedupeKey, row.dedupeKey),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db.update(jobListingsCache).set(base).where(eq(jobListingsCache.id, existing[0]!.id));
  } else {
    await db.insert(jobListingsCache).values(base);
  }
}

/**
 * Safety net: convert any date string (including relative like "2 days ago") to
 * YYYY-MM-DD for PostgreSQL's date column. Returns null for unparseable input.
 */
function safeParseDate(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const now = new Date();

  if (s === 'today' || s === 'just now' || s === 'just posted') {
    return fmt(now);
  }
  if (s === 'yesterday') {
    now.setDate(now.getDate() - 1);
    return fmt(now);
  }

  const rel = s.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (rel && rel[1] && rel[2]) {
    const n = parseInt(rel[1], 10);
    switch (rel[2]) {
      case 'day':
        now.setDate(now.getDate() - n);
        break;
      case 'week':
        now.setDate(now.getDate() - n * 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - n);
        break;
      case 'year':
        now.setFullYear(now.getFullYear() - n);
        break;
      default:
        break;
    }
    return fmt(now);
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return fmt(parsed);

  return null;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** List job listings from cache for a blessed source, ordered by last_seen_at desc. */
export async function listJobListingsByBlessedSource(db: Db, blessedSourceId: string, limit = 100) {
  return db
    .select()
    .from(jobListingsCache)
    .where(eq(jobListingsCache.blessedSourceId, blessedSourceId))
    .orderBy(desc(jobListingsCache.lastSeenAt))
    .limit(limit);
}

/** Count job listings for a blessed source. */
export async function countJobListingsByBlessedSource(
  db: Db,
  blessedSourceId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(jobListingsCache)
    .where(eq(jobListingsCache.blessedSourceId, blessedSourceId));
  return row?.n ?? 0;
}
