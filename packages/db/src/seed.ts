import { getDb } from './client';
import { users, blessedSources } from './schema';
import { addSource } from './sources';

export const BLESSED_SOURCES = [
  { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/', type: 'AGGREGATOR' as const },
  { name: 'Indeed', url: 'https://www.indeed.com/jobs', type: 'AGGREGATOR' as const },
  { name: 'Wellfound (AngelList)', url: 'https://wellfound.com/jobs', type: 'AGGREGATOR' as const },
  { name: 'Glassdoor', url: 'https://www.glassdoor.com/Job/', type: 'AGGREGATOR' as const },
  { name: 'Dice', url: 'https://www.dice.com/jobs', type: 'AGGREGATOR' as const },
  { name: 'ZipRecruiter', url: 'https://www.ziprecruiter.com/jobs/', type: 'AGGREGATOR' as const },
  { name: 'SimplyHired', url: 'https://www.simplyhired.com/search', type: 'AGGREGATOR' as const },
  { name: 'Built In', url: 'https://builtin.com/jobs', type: 'AGGREGATOR' as const },
  { name: 'Levels.fyi Jobs', url: 'https://www.levels.fyi/jobs', type: 'AGGREGATOR' as const },
  {
    name: "Hacker News Who's Hiring",
    url: 'https://news.ycombinator.com',
    type: 'COMMUNITY' as const,
  },
];

const BLESSED_SOURCE_SLUGS: Record<string, string> = {
  'LinkedIn Jobs': 'linkedin_jobs',
  Indeed: 'indeed',
  'Wellfound (AngelList)': 'wellfound',
  Glassdoor: 'glassdoor',
  Dice: 'dice',
  ZipRecruiter: 'ziprecruiter',
  SimplyHired: 'simplyhired',
  'Built In': 'builtin',
  'Levels.fyi Jobs': 'levels_fyi',
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
