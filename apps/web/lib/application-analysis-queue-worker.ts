/**
 * In-process worker for application analysis queue (CSV upload).
 * One worker per user; admin starts via Play; Hard stop sets flag so loop exits after current URL.
 */

import { getDb, getNextPendingForUser, updateQueueRow, insertAnalysis } from '@careersignal/db';
import { applicationAnalysisQueue as table } from '@careersignal/db/schema';
import { eq, and } from 'drizzle-orm';
import { runApplicationAssistantPipeline } from '@/lib/application-assistant-runner';

const DELAY_BETWEEN_JOBS_MS = 10_000; // 10s so user sees transition

let queueWorkerRunningUserId: string | null = null;
let queueStopRequestedForUserId: string | null = null;

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

async function runQueueWorkerLoop(userId: string): Promise<void> {
  const db = getDb();
  
  // Clean up any previously stuck 'running' rows before starting the loop
  await db.update(table).set({ status: 'pending', analysisId: null }).where(and(eq(table.userId, userId), eq(table.status, 'running')));

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
