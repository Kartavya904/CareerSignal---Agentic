import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, insertQueueRows } from '@careersignal/db';

/** Parse CSV text: one column of URLs (one per row). Optional header row. */
function parseCsvUrls(csvText: string): string[] {
  const lines = csvText.split(/\r?\n/);
  const urls: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const firstColumn = trimmed.split(',')[0]?.trim() ?? trimmed;
    const url = firstColumn.replace(/^"|"$/g, '').trim();
    if (!url) continue;
    if (url.toLowerCase() === 'url' && urls.length === 0) continue;
    try {
      new URL(url);
      urls.push(url);
    } catch {
      // skip invalid URLs
    }
  }
  return urls;
}

export async function POST(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const contentType = req.headers.get('content-type') ?? '';
    let urls: string[];

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      const raw = body?.urls;
      if (!Array.isArray(raw)) {
        return NextResponse.json({ error: 'urls array required' }, { status: 400 });
      }
      urls = raw
        .filter((u) => typeof u === 'string')
        .map((u) => u.trim())
        .filter(Boolean);
      for (const u of urls) {
        try {
          new URL(u);
        } catch {
          return NextResponse.json({ error: `Invalid URL: ${u}` }, { status: 400 });
        }
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') ?? formData.get('csv');
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'CSV file required' }, { status: 400 });
      }
      const text = await file.text();
      urls = parseCsvUrls(text);
    } else {
      return NextResponse.json(
        { error: 'Content-Type must be application/json or multipart/form-data' },
        { status: 400 },
      );
    }

    if (urls.length === 0) {
      return NextResponse.json({ error: 'No valid URLs found' }, { status: 400 });
    }

    const db = getDb();
    const inserted = await insertQueueRows(db, userId, urls);
    return NextResponse.json({ ok: true, added: inserted.length, total: urls.length });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[application-assistant/queue/upload]', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
