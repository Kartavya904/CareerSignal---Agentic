import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { scrapeVisitedUrls } from './schema';

/**
 * Load all URLs already visited for this blessed source (e.g. from previous runs).
 * Use to seed urlSeen so the scraper does not re-visit them after a server restart.
 */
export async function getVisitedUrlsForSource(
  db: Db,
  blessedSourceId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ normalizedUrl: scrapeVisitedUrls.normalizedUrl })
    .from(scrapeVisitedUrls)
    .where(eq(scrapeVisitedUrls.blessedSourceId, blessedSourceId));
  return new Set(rows.map((r) => r.normalizedUrl));
}

/**
 * Record that a URL was visited for this source. Idempotent (same URL can be marked again).
 * Call after each successful page visit so state persists across restarts.
 */
export async function markUrlVisited(
  db: Db,
  blessedSourceId: string,
  normalizedUrl: string,
): Promise<void> {
  await db
    .insert(scrapeVisitedUrls)
    .values({
      blessedSourceId,
      normalizedUrl,
    })
    .onConflictDoNothing({
      target: [scrapeVisitedUrls.blessedSourceId, scrapeVisitedUrls.normalizedUrl],
    });
}
