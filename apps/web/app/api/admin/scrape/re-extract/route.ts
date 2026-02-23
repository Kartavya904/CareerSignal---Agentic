import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { agentLog } from '@/lib/agent-logs';
import { getDb, upsertJobListingCache } from '@careersignal/db';
import { extractJobsFromHtml, normalizeJobForCache } from '@careersignal/agents';
import { readBestCaptureHtml, listCaptures, readCaptureHtml } from '@/lib/source-data';

/**
 * POST /api/admin/scrape/re-extract
 * Re-run extraction on a previously saved HTML capture.
 * Body: { slug: string, captureId?: string }
 *   If captureId omitted, uses the best (most recent with jobs, or latest) capture.
 */
export async function POST(req: Request) {
  try {
    await getRequiredUserId();

    const body = await req.json().catch(() => ({}));
    const slug = body?.slug as string | undefined;
    if (!slug) {
      return NextResponse.json({ ok: false, message: 'Missing slug' }, { status: 400 });
    }

    const captureId = body?.captureId as string | undefined;
    let html: string | null = null;
    let entryUrl = '';
    let entryId = '';

    if (captureId) {
      html = await readCaptureHtml(slug, captureId);
      entryId = captureId;
    } else {
      const best = await readBestCaptureHtml(slug);
      if (best) {
        html = best.html;
        entryUrl = best.entry.url;
        entryId = best.entry.id;
      }
    }

    if (!html) {
      return NextResponse.json({ ok: false, message: 'No capture found' }, { status: 404 });
    }

    agentLog(
      'DOM Extractor',
      `Re-extracting from saved capture ${entryId} (${html.length} chars)`,
      {
        level: 'info',
      },
    );

    const result = await extractJobsFromHtml(html, entryUrl || `https://wellfound.com/jobs`, {
      slug,
    });

    agentLog(
      'DOM Extractor',
      `Re-extraction: ${result.listings.length} listings (strategy: ${result.strategy})`,
      { level: result.listings.length > 0 ? 'success' : 'warn' },
    );

    const db = getDb();
    const captures = await listCaptures(slug);
    const sourceEntry = captures.find((c) => c.id === entryId);
    let upserted = 0;

    if (result.listings.length > 0) {
      for (const raw of result.listings) {
        const row = normalizeJobForCache(raw, slug);
        await upsertJobListingCache(db, row);
        upserted++;
      }
      agentLog('Normalizer', `Re-extract upserted ${upserted} jobs`, { level: 'success' });
    }

    return NextResponse.json({
      ok: true,
      captureId: entryId,
      htmlChars: html.length,
      jobsExtracted: result.listings.length,
      strategy: result.strategy,
      upserted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    agentLog('DOM Extractor', `Re-extraction failed: ${msg}`, { level: 'error' });
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
