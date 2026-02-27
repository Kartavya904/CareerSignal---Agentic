import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { companies } from './schema';

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export async function findCompanyByNormalizedName(db: Db, name: string) {
  const normalized = normalizeCompanyName(name);
  const [row] = await db
    .select()
    .from(companies)
    .where(eq(companies.normalizedName, normalized))
    .limit(1);
  return row ?? null;
}
