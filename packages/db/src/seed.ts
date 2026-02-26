import { getDb } from './client';
import { users, blessedSources } from './schema';
import { addSource } from './sources';

/**
 * Default blessed sources for admin scraping. Chosen for:
 * - Minimal login/captcha walls (scraper-friendly)
 * - Same-domain listing → detail crawl (Planner + Brain)
 * - Good job volume where possible
 *
 * Replaces previous set (LinkedIn, Indeed, Glassdoor, etc.) that routinely hit
 * login/captcha or bot blocking. Seed is used when blessed_sources table is empty.
 */
export const BLESSED_SOURCES = [
  { name: 'We Work Remotely', url: 'https://weworkremotely.com/', type: 'AGGREGATOR' as const },
  { name: 'Remote OK', url: 'https://remoteok.com/', type: 'AGGREGATOR' as const },
  {
    name: 'Stack Overflow Jobs',
    url: 'https://stackoverflow.com/jobs',
    type: 'AGGREGATOR' as const,
  },
  { name: 'Wellfound (AngelList)', url: 'https://wellfound.com/jobs', type: 'AGGREGATOR' as const },
  { name: 'Jobicy', url: 'https://jobicy.com/', type: 'AGGREGATOR' as const },
  { name: 'Authentic Jobs', url: 'https://authenticjobs.com/', type: 'AGGREGATOR' as const },
  { name: 'JustRemote', url: 'https://justremote.co/remote-jobs', type: 'AGGREGATOR' as const },
  {
    name: 'Work at a Startup (YC)',
    url: 'https://www.workatastartup.com/jobs',
    type: 'AGGREGATOR' as const,
  },
  { name: 'The Muse', url: 'https://www.themuse.com/jobs', type: 'AGGREGATOR' as const },
  {
    name: "Hacker News Who's Hiring",
    url: 'https://news.ycombinator.com',
    type: 'COMMUNITY' as const,
  },
];

const BLESSED_SOURCE_SLUGS: Record<string, string> = {
  'We Work Remotely': 'weworkremotely',
  'Remote OK': 'remoteok',
  'Stack Overflow Jobs': 'stackoverflow_jobs',
  'Wellfound (AngelList)': 'wellfound',
  Jobicy: 'jobicy',
  'Authentic Jobs': 'authentic_jobs',
  JustRemote: 'justremote',
  'Work at a Startup (YC)': 'workatastartup',
  'The Muse': 'themuse',
  "Hacker News Who's Hiring": 'hn_who_is_hiring',
};

/** Ensures default user exists; returns user id. Default sources are not auto-seeded; user adds them from the Sources page. */
export async function ensureDefaultUser(): Promise<string> {
  const db = getDb();
  const [existing] = await db.select().from(users).limit(1);
  if (existing) return existing.id;
  const [user] = await db.insert(users).values({}).returning();
  if (!user) throw new Error('Failed to create default user');
  return user.id;
}

/** Seeds the blessed_sources table from BLESSED_SOURCES. Idempotent: only inserts if table is empty. */
export async function seedBlessedSourcesTable(): Promise<void> {
  const db = getDb();
  const existing = await db.select().from(blessedSources).limit(1);
  if (existing.length > 0) return;

  const rows = BLESSED_SOURCES.map((s) => ({
    name: s.name,
    url: s.url,
    type: s.type as 'COMPANY' | 'AGGREGATOR' | 'COMMUNITY' | 'CUSTOM',
    slug:
      BLESSED_SOURCE_SLUGS[s.name] ??
      s.name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, ''),
    enabledForScraping: true,
    scrapeIntervalMinutes: 1440,
  }));
  await db.insert(blessedSources).values(rows);
}

/** Seeds blessed default sources for the given user (user's sources table). Idempotent by URL. */
export async function seedBlessedSources(userId: string): Promise<void> {
  const db = getDb();
  await seedBlessedSourcesTable();
  const blessed = await db.select().from(blessedSources);
  for (const bs of blessed) {
    await addSource(db, userId, {
      name: bs.name,
      url: bs.url,
      type: bs.type as string,
      isBlessed: true,
      blessedSourceId: bs.id,
    });
  }
}
