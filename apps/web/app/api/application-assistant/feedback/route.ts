import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getAnalysisById, getFeedbackForAnalysis, insertFeedback } from '@careersignal/db';

/** GET ?analysisId=... - List feedback for an analysis (current user only). */
export async function GET(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const analysisId = new URL(req.url).searchParams.get('analysisId');
    if (!analysisId) {
      return NextResponse.json({ error: 'Missing analysisId' }, { status: 400 });
    }
    const db = getDb();
    const analysis = await getAnalysisById(db, analysisId);
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const feedback = await getFeedbackForAnalysis(db, analysisId, userId);
    return NextResponse.json({ feedback });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/** POST { analysisId, component, value, comment? } - Submit feedback. */
export async function POST(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const body = await req.json().catch(() => ({}));
    const analysisId = body?.analysisId;
    const component = body?.component;
    const value = body?.value;
    const comment = body?.comment ?? null;
    if (!analysisId || !component || !value) {
      return NextResponse.json(
        { error: 'Missing analysisId, component, or value' },
        { status: 400 },
      );
    }
    if (!['match', 'contact', 'outreach', 'overall'].includes(component)) {
      return NextResponse.json({ error: 'Invalid component' }, { status: 400 });
    }
    if (value !== 'up' && value !== 'down') {
      return NextResponse.json({ error: 'value must be "up" or "down"' }, { status: 400 });
    }
    const db = getDb();
    const analysis = await getAnalysisById(db, analysisId);
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await insertFeedback(db, {
      analysisId,
      userId,
      component: component as 'match' | 'contact' | 'outreach' | 'overall',
      value: value as 'up' | 'down',
      comment: comment || undefined,
    });
    const feedback = await getFeedbackForAnalysis(db, analysisId, userId);
    return NextResponse.json({ ok: true, feedback });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
