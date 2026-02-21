import { getDb } from './client';
import { users } from './schema';
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

/** Ensures default user exists; returns user id. Default sources are not auto-seeded; user adds them from the Sources page. */
export async function ensureDefaultUser(): Promise<string> {
  const db = getDb();
  const [existing] = await db.select().from(users).limit(1);
  if (existing) return existing.id;
  const [user] = await db.insert(users).values({}).returning();
  if (!user) throw new Error('Failed to create default user');
  return user.id;
}

/** Seeds blessed default sources for the given user. Idempotent by URL. */
export async function seedBlessedSources(userId: string): Promise<void> {
  const db = getDb();
  for (const source of BLESSED_SOURCES) {
    await addSource(db, userId, {
      name: source.name,
      url: source.url,
      type: source.type,
      isBlessed: true,
    });
  }
}
