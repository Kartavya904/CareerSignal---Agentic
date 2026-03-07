import { eq, and, asc } from 'drizzle-orm';
import type { Db } from './client';
import { applicationAnalysisQueue as table, applicationAnalysisQueueStatusEnum } from './schema';

export type QueueRowStatus = (typeof applicationAnalysisQueueStatusEnum.enumValues)[number];

export interface QueueRow {
  id: string;
  userId: string;
  url: string;
  status: QueueRowStatus;
  sequence: number;
  analysisId: string | null;
  createdAt: Date;
}

export async function insertQueueRows(db: Db, userId: string, urls: string[]): Promise<QueueRow[]> {
  if (urls.length === 0) return [];
  const maxSeq = await db
    .select()
    .from(table)
    .where(eq(table.userId, userId))
    .then((rows) => {
      const max = rows.reduce((m, r) => Math.max(m, r.sequence ?? 0), 0);
      return max;
    });
  const values = urls.map((url, i) => ({
    userId,
    url,
    status: 'pending' as const,
    sequence: maxSeq + i + 1,
  }));
  const inserted = await db.insert(table).values(values).returning();
  return inserted as unknown as QueueRow[];
}

/** Get next pending row for user (lowest sequence). */
export async function getNextPendingForUser(db: Db, userId: string): Promise<QueueRow | null> {
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.userId, userId), eq(table.status, 'pending')))
    .orderBy(asc(table.sequence))
    .limit(1);
  return (row as unknown as QueueRow) ?? null;
}

export async function updateQueueRow(
  db: Db,
  id: string,
  data: { status?: QueueRowStatus; analysisId?: string | null },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (data.status !== undefined) set.status = data.status;
  if (data.analysisId !== undefined) set.analysisId = data.analysisId;
  if (Object.keys(set).length === 0) return;
  await db.update(table).set(set).where(eq(table.id, id));
}

/** Reset all 'running' rows to 'pending' for a user. Useful on startup or hard stop. */
export async function resetRunningToPendingForUser(db: Db, userId: string): Promise<void> {
  await db
    .update(table)
    .set({ status: 'pending', analysisId: null })
    .where(and(eq(table.userId, userId), eq(table.status, 'running')));
}

/** Counts by status for a user. */
export async function getQueueCountsByUser(
  db: Db,
  userId: string,
): Promise<{ pending: number; running: number; completed: number; failed: number; total: number }> {
  const rows = await db.select().from(table).where(eq(table.userId, userId));
  const pending = rows.filter((r) => r.status === 'pending').length;
  const running = rows.filter((r) => r.status === 'running').length;
  const completed = rows.filter((r) => r.status === 'completed').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  return { pending, running, completed, failed, total: rows.length };
}

/** List users that have at least one queue row, with counts. For admin. */
export async function getUsersWithQueue(
  db: Db,
): Promise<
  {
    userId: string;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    total: number;
  }[]
> {
  const rows = await db.select().from(table);
  const byUser = new Map<
    string,
    { pending: number; running: number; completed: number; failed: number; total: number }
  >();
  for (const r of rows) {
    const uid = r.userId;
    if (!byUser.has(uid)) {
      byUser.set(uid, { pending: 0, running: 0, completed: 0, failed: 0, total: 0 });
    }
    const c = byUser.get(uid)!;
    c.total += 1;
    if (r.status === 'pending') c.pending += 1;
    else if (r.status === 'running') c.running += 1;
    else if (r.status === 'completed') c.completed += 1;
    else c.failed += 1;
  }
  return Array.from(byUser.entries()).map(([userId, counts]) => ({ userId, ...counts }));
}

/** Current running index (1-based) and total for progress display. */
export async function getQueueProgressForUser(
  db: Db,
  userId: string,
): Promise<{ current: number; total: number; runningRowId: string | null } | null> {
  const rows = await db
    .select()
    .from(table)
    .where(eq(table.userId, userId))
    .orderBy(asc(table.sequence));
  if (rows.length === 0) return null;
  const total = rows.length;
  const runningIdx = rows.findIndex((r) => r.status === 'running');
  const completedCount = rows.filter((r) => r.status === 'completed').length;
  const failedCount = rows.filter((r) => r.status === 'failed').length;
  const current = runningIdx >= 0 ? completedCount + failedCount + 1 : completedCount + failedCount;
  const runningRowId = runningIdx >= 0 ? rows[runningIdx]?.id ?? null : null;
  return { current, total, runningRowId };
}
