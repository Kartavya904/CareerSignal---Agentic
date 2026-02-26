import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getRunningAnalysisForUser, markStaleRunsAsError } from '@careersignal/db';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    await markStaleRunsAsError(db, userId);
    const row = await getRunningAnalysisForUser(db, userId);
    if (!row) {
      return NextResponse.json({
        running: false,
        sessionId: null,
        currentStep: 'idle',
        analysisId: null,
        waitingForLogin: false,
        waitingForCaptcha: false,
      });
    }
    return NextResponse.json({
      running: true,
      sessionId: null,
      currentStep: row.currentStep ?? 'scraping',
      analysisId: row.id,
      waitingForLogin: row.waitingForLogin ?? false,
      waitingForCaptcha: row.waitingForCaptcha ?? false,
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
