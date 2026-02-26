import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { blessedSources } from './schema';

export async function listBlessedSources(db: Db) {
  return db.select().from(blessedSources);
}

export async function setBlessedSourceEnabledForScraping(db: Db, id: string, enabled: boolean) {
  const [updated] = await db
    .update(blessedSources)
    .set({ enabledForScraping: enabled, updatedAt: new Date() })
    .where(eq(blessedSources.id, id))
    .returning();
  return updated ?? null;
}

export async function getBlessedSourceById(db: Db, id: string) {
  const [row] = await db.select().from(blessedSources).where(eq(blessedSources.id, id)).limit(1);
  return row ?? null;
}

export async function updateBlessedSourceUrl(db: Db, id: string, url: string) {
  const [updated] = await db
    .update(blessedSources)
    .set({ url, updatedAt: new Date() })
    .where(eq(blessedSources.id, id))
    .returning();
  return updated ?? null;
}

export async function setBlessedSourceScraped(
  db: Db,
  id: string,
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL',
) {
  await db
    .update(blessedSources)
    .set({
      lastScrapedAt: new Date(),
      lastScrapeStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(blessedSources.id, id));
}
