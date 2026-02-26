import { and, eq } from 'drizzle-orm';
import type { Db } from './client';
import { sources as sourcesTable } from './schema';

export async function listSources(db: Db, userId: string) {
  return db.select().from(sourcesTable).where(eq(sourcesTable.userId, userId));
}

export async function setSourceEnabled(db: Db, userId: string, sourceId: string, enabled: boolean) {
  const [updated] = await db
    .update(sourcesTable)
    .set({ enabled })
    .where(and(eq(sourcesTable.id, sourceId), eq(sourcesTable.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function addSource(
  db: Db,
  userId: string,
  data: {
    name: string;
    url: string;
    type?: string;
    isBlessed?: boolean;
  },
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

export async function deleteSource(db: Db, userId: string, sourceId: string) {
  const [deleted] = await db
    .delete(sourcesTable)
    .where(and(eq(sourcesTable.id, sourceId), eq(sourcesTable.userId, userId)))
    .returning({ id: sourcesTable.id });
  return deleted ?? null;
}

export async function getEnabledSourceIds(db: Db, userId: string) {
  const rows = await db
    .select({ id: sourcesTable.id })
    .from(sourcesTable)
    .where(and(eq(sourcesTable.userId, userId), eq(sourcesTable.enabled, true)));
  return rows.filter((r) => r.id !== null).map((r) => r.id as string);
}
