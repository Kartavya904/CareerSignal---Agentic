import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { listCaptures } from '@/lib/source-data';

/**
 * GET /api/admin/scrape/captures?slug=wellfound
 * Returns the list of saved HTML captures for a source.
 */
export async function GET(req: Request) {
  try {
    await getRequiredUserId();

    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    if (!slug) {
      return NextResponse.json({ ok: false, message: 'Missing slug' }, { status: 400 });
    }

    const captures = await listCaptures(slug);
    return NextResponse.json({ ok: true, slug, captures });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
