/**
 * POST /api/admin/deep-company-research/stop
 * Hard stop: set the latest run with status 'running' to 'failed' so the admin UI
 * no longer shows running and does not resume. Use when the server was stopped
 * without stopping the run, leaving the DB in a running state.
 */

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  getDb,
  updateDeepCompanyResearchRunStatus,
  insertDeepCompanyResearchAdminLog,
  getLatestDeepCompanyResearchRunWithLogs,
} from '@careersignal/db';

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const data = await getLatestDeepCompanyResearchRunWithLogs(db);
  if (!data || data.run.status !== 'running') {
    return NextResponse.json({
      ok: false,
      error: 'No running deep company research run to stop.',
    });
  }

  await updateDeepCompanyResearchRunStatus(db, data.run.id, 'failed');
  await insertDeepCompanyResearchAdminLog(db, {
    runId: data.run.id,
    ts: new Date(),
    level: 'info',
    message: 'Stopped by user (hard stop).',
  });

  return NextResponse.json({ ok: true });
}
