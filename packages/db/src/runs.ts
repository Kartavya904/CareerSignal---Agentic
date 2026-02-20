import { eq, desc } from 'drizzle-orm';
import type { Db } from './client';
import { runs as runsTable } from './schema';

export interface CreateRunInput {
  userId: string;
  sourceIds?: string[];
}

export async function createRun(db: Db, input: CreateRunInput) {
  const [run] = await db
    .insert(runsTable)
    .values({
      userId: input.userId,
      sourceIds: input.sourceIds ?? [],
      status: 'PENDING',
    })
    .returning();
  return run;
}

export async function listRuns(db: Db, userId: string, limit = 50) {
  return db
    .select()
    .from(runsTable)
    .where(eq(runsTable.userId, userId))
    .orderBy(desc(runsTable.createdAt))
    .limit(limit);
}

export async function getRunById(db: Db, id: string, userId: string) {
  const [run] = await db.select().from(runsTable).where(eq(runsTable.id, id)).limit(1);
  if (!run || run.userId !== userId) return null;
  return run;
}

export async function updateRunStatus(
  db: Db,
  runId: string,
  userId: string,
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED',
  errorMessage?: string,
) {
  const updates: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === 'RUNNING') updates.startedAt = new Date();
  if (status === 'COMPLETED' || status === 'FAILED') updates.finishedAt = new Date();
  if (errorMessage) updates.errorMessage = errorMessage;
  const [updated] = await db
    .update(runsTable)
    .set(updates as Record<string, unknown>)
    .where(eq(runsTable.id, runId))
    .returning();
  if (!updated || updated.userId !== userId) return null;
  return updated;
}

export async function updateRunPlanSnapshot(
  db: Db,
  runId: string,
  userId: string,
  planSnapshot: unknown,
) {
  const [updated] = await db
    .update(runsTable)
    .set({ planSnapshot, updatedAt: new Date() })
    .where(eq(runsTable.id, runId))
    .returning();
  if (!updated || updated.userId !== userId) return null;
  return updated;
}
