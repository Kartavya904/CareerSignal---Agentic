import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { jobListings, companies } from './schema';

function normalizeDedupeKey(url: string): string {
  try {
    const u = new URL(url);
    return u.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.replace(/\/$/, '').toLowerCase();
  }
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
  const key = normalizeDedupeKey(applyUrl);
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
