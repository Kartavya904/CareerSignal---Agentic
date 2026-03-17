import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@careersignal/db';
import { applicationAnalysisQueue as table } from '@careersignal/db/schema';
import { or, eq } from 'drizzle-orm';
import {
  requestPriorityQueueStop,
  getQueueWorkerRunningUserId,
  requestQueueStopForUser,
} from '@/lib/application-analysis-queue-worker';

/** POST: clear all pending queue items for priority users and hard stop priority worker. Admin only. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Request stop for any running worker (priority or single-user).
  requestPriorityQueueStop();
  const runningUserId = getQueueWorkerRunningUserId();
  if (runningUserId) {
    requestQueueStopForUser(runningUserId);
  }

  const db = getDb();

  // Delete all pending or running rows for all users.
  await db.delete(table).where(or(eq(table.status, 'pending'), eq(table.status, 'running')));

  return NextResponse.json({ ok: true });
}
