import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import {
  getDb,
  getRunningAnalysisForUser,
  getAnalysisById,
  getAnalysisLogs,
} from '@careersignal/db';

export async function GET(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const analysisIdParam = searchParams.get('analysisId') ?? undefined;
    const afterId = searchParams.get('after') ?? undefined;

    let analysisId: string;
    if (analysisIdParam) {
      const analysis = await getAnalysisById(db, analysisIdParam);
      if (!analysis || analysis.userId !== userId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      analysisId = analysisIdParam;
    } else {
      const running = await getRunningAnalysisForUser(db, userId);
      if (!running) {
        return NextResponse.json({ logs: [] });
      }
      analysisId = running.id;
    }

    const rows = await getAnalysisLogs(db, analysisId, afterId);
    const logs = rows.map((r) => ({
      id: r.id,
      ts: new Date(r.ts).getTime(),
      agent: r.agent,
      level: r.level,
      message: r.message,
      detail: r.detail ?? undefined,
    }));
    return NextResponse.json({ logs });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
