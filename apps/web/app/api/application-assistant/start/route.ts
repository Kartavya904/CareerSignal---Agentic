import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getScraperStatus } from '@/lib/scraper-state';
import { getDb, insertAnalysis, getRunningAnalysisForUser } from '@careersignal/db';
import { setAssistantAbortController } from '@/lib/application-assistant-state';
import { runApplicationAssistantPipeline } from '@/lib/application-assistant-runner';

export async function POST(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();

    const existing = await getRunningAnalysisForUser(db, userId);
    if (existing) {
      return NextResponse.json({ ok: false, message: 'Already running' }, { status: 409 });
    }
    if (getScraperStatus().running) {
      return NextResponse.json(
        { ok: false, message: 'Admin scraper is running. Stop it first.' },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const url = body?.url;
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ ok: false, message: 'URL is required' }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ ok: false, message: 'Invalid URL' }, { status: 400 });
    }

    const analysis = await insertAnalysis(db, { userId, url });
    const sessionId = `aa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const controller = new AbortController();
    setAssistantAbortController(analysis.id, controller);
    runApplicationAssistantPipeline(userId, url, analysis.id, controller.signal).catch(() => {});

    return NextResponse.json({
      ok: true,
      sessionId,
      running: true,
      analysisId: analysis.id,
      currentStep: analysis.currentStep ?? 'scraping',
      waitingForLogin: analysis.waitingForLogin ?? false,
      waitingForCaptcha: analysis.waitingForCaptcha ?? false,
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
