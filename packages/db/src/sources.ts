import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { sources as sourcesTable } from './schema';

export async function listSources(db: Db, userId: string) {
  return db.select().from(sourcesTable).where(eq(sourcesTable.userId, userId));
}

export async function addSource(
  db: Db,
  userId: string,
  data: { name: string; url: string; type?: string; isBlessed?: boolean },
) {
  const [source] = await db
    .insert(sourcesTable)
    .values({
      userId,
      name: data.name,
      url: data.url,
      type: (data.type as 'COMPANY' | 'AGGREGATOR' | 'COMMUNITY' | 'CUSTOM') ?? 'CUSTOM',
      isBlessed: data.isBlessed ?? false,
    })
    .returning();
  return source;
}

export async function getSourceById(db: Db, id: string, userId: string) {
  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, id)).limit(1);
  if (!source || source.userId !== userId) return null;
  return source;
}

export async function getEnabledSourceIds(db: Db, userId: string) {
  const rows = await db
    .select({ id: sourcesTable.id })
    .from(sourcesTable)
    .where(eq(sourcesTable.userId, userId));
  return rows.filter((r) => r.id !== null).map((r) => r.id as string);
}
