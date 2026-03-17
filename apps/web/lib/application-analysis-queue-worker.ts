/**
 * In-process worker for application analysis queue (CSV upload).
 * One worker per user; admin starts via Play; Hard stop sets flag so loop exits after current URL.
 */

import { getDb, getNextPendingForUser, updateQueueRow, insertAnalysis } from '@careersignal/db';
import { applicationAnalysisQueue as table, users } from '@careersignal/db/schema';
import { eq, and } from 'drizzle-orm';
import { runApplicationAssistantPipeline } from '@/lib/application-assistant-runner';

const DELAY_BETWEEN_JOBS_MS = 10_000; // 10s so user sees transition

let queueWorkerRunningUserId: string | null = null;
let queueStopRequestedForUserId: string | null = null;

// Special marker used when the worker is running in "priority rotation" mode.
const PRIORITY_WORKER_ID = '__PRIORITY__';

export function getQueueWorkerRunningUserId(): string | null {
  return queueWorkerRunningUserId;
}

export function isQueueWorkerRunningForUser(userId: string): boolean {
  return queueWorkerRunningUserId === userId;
}

export function requestQueueStopForUser(userId: string): void {
  queueStopRequestedForUserId = userId;
}

function clearQueueStopRequest(userId: string): void {
  if (queueStopRequestedForUserId === userId) queueStopRequestedForUserId = null;
}

export function isStopRequestedForUser(userId: string): boolean {
  return queueStopRequestedForUserId === userId;
}

/** Run the queue worker for the given user. Call from admin start API; runs in background. */
export function runQueueWorker(userId: string): void {
  if (queueWorkerRunningUserId != null) {
    return; // already running for someone
  }
  queueWorkerRunningUserId = userId;
  clearQueueStopRequest(userId);
  runQueueWorkerLoop(userId).finally(() => {
    queueWorkerRunningUserId = null;
    clearQueueStopRequest(userId);
  });
}

/** Run the queue worker across all priority users in a cyclic order. Admin global Play. */
export function runPriorityQueueWorker(): void {
  if (queueWorkerRunningUserId != null) {
    return;
  }
  queueWorkerRunningUserId = PRIORITY_WORKER_ID;
  queueStopRequestedForUserId = null;
  runPriorityQueueWorkerLoop().finally(() => {
    queueWorkerRunningUserId = null;
    queueStopRequestedForUserId = null;
  });
}

async function runQueueWorkerLoop(userId: string): Promise<void> {
  const db = getDb();

  // Clean up any previously stuck 'running' rows before starting the loop
  await db
    .update(table)
    .set({ status: 'pending', analysisId: null })
    .where(and(eq(table.userId, userId), eq(table.status, 'running')));

  while (true) {
    if (queueStopRequestedForUserId === userId) {
      break;
    }
    const row = await getNextPendingForUser(db, userId);
    if (!row) {
      break;
    }
    await updateQueueRow(db, row.id, { status: 'running' });
    const analysis = await insertAnalysis(db, {
      userId,
      url: row.url,
      runSource: 'batch',
    });
    try {
      await runApplicationAssistantPipeline(userId, row.url, analysis.id, null);
      await updateQueueRow(db, row.id, { status: 'completed', analysisId: analysis.id });
    } catch (err) {
      if (queueStopRequestedForUserId === userId) {
        await updateQueueRow(db, row.id, { status: 'pending', analysisId: null });
      } else {
        await updateQueueRow(db, row.id, { status: 'failed', analysisId: analysis.id });
      }
      // continue to next URL
    }
    if (queueStopRequestedForUserId === userId) {
      break;
    }
    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_JOBS_MS));
  }
}

async function runPriorityQueueWorkerLoop(): Promise<void> {
  const db = getDb();

  // Snapshot of users who are marked as priority and have at least one pending item.
  const pendingPriorityRows = await db
    .select({ userId: table.userId })
    .from(table)
    .innerJoin(users, eq(users.id, table.userId))
    .where(and(eq(table.status, 'pending'), eq(users.applicationAnalysisPriority, true)));

  const priorityUserIds: string[] = Array.from(new Set(pendingPriorityRows.map((r) => r.userId)));

  if (priorityUserIds.length === 0) {
    return;
  }

  let index = 0;

  while (priorityUserIds.length > 0) {
    if (queueStopRequestedForUserId === PRIORITY_WORKER_ID) {
      break;
    }

    if (index >= priorityUserIds.length) {
      index = 0;
    }

    const userId = priorityUserIds[index];

    // Clean up any previously stuck 'running' rows before starting for this user
    await db
      .update(table)
      .set({ status: 'pending', analysisId: null })
      .where(and(eq(table.userId, userId), eq(table.status, 'running')));

    const row = await getNextPendingForUser(db, userId);
    if (!row) {
      // No more pending for this user; remove from rotation.
      priorityUserIds.splice(index, 1);
      if (priorityUserIds.length === 0) {
        break;
      }
      // Do not advance index; it now points to the next user.
      continue;
    }

    await updateQueueRow(db, row.id, { status: 'running' });
    const analysis = await insertAnalysis(db, {
      userId,
      url: row.url,
      runSource: 'batch',
    });
    try {
      await runApplicationAssistantPipeline(userId, row.url, analysis.id, null);
      await updateQueueRow(db, row.id, { status: 'completed', analysisId: analysis.id });
    } catch (err) {
      if (queueStopRequestedForUserId === PRIORITY_WORKER_ID) {
        await updateQueueRow(db, row.id, { status: 'pending', analysisId: null });
      } else {
        await updateQueueRow(db, row.id, { status: 'failed', analysisId: analysis.id });
      }
      // continue to next URL
    }

    if (queueStopRequestedForUserId === PRIORITY_WORKER_ID) {
      break;
    }

    // Advance to next user in round-robin.
    index = (index + 1) % priorityUserIds.length;

    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_JOBS_MS));
  }
}
