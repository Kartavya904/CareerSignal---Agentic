import { eq, and } from 'drizzle-orm';
import type { Db } from './client';
import { jobObservations as jobObservationsTable } from './schema';

export interface InsertJobObservationInput {
  jobId: string;
  sourceId: string;
  observedUrl?: string | null;
  contentHash?: string | null;
}

export async function insertJobObservation(db: Db, input: InsertJobObservationInput) {
  const [row] = await db
    .insert(jobObservationsTable)
    .values(input)
    .onConflictDoNothing({
      target: [jobObservationsTable.jobId, jobObservationsTable.sourceId],
    })
    .returning();
  return row ?? null;
}

export async function upsertJobObservation(db: Db, input: InsertJobObservationInput) {
  const [row] = await db
    .insert(jobObservationsTable)
    .values(input)
    .onConflictDoUpdate({
      target: [jobObservationsTable.jobId, jobObservationsTable.sourceId],
      set: {
        observedUrl: input.observedUrl ?? null,
        contentHash: input.contentHash ?? null,
        observedAt: new Date(),
      },
    })
    .returning();
  return row ?? null;
}

export async function listObservationsByJobId(db: Db, jobId: string) {
  return db.select().from(jobObservationsTable).where(eq(jobObservationsTable.jobId, jobId));
}

export async function listObservationsBySourceId(db: Db, sourceId: string) {
  return db.select().from(jobObservationsTable).where(eq(jobObservationsTable.sourceId, sourceId));
}

export async function getJobObservation(db: Db, jobId: string, sourceId: string) {
  const [row] = await db
    .select()
    .from(jobObservationsTable)
    .where(and(eq(jobObservationsTable.jobId, jobId), eq(jobObservationsTable.sourceId, sourceId)))
    .limit(1);
  return row ?? null;
}
