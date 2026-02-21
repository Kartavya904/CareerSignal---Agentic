import { NextResponse } from 'next/server';
import { getDb, setSourceEnabled, deleteSource } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sourceId } = await params;
    const userId = await getRequiredUserId();
    const db = getDb();
    const deleted = await deleteSource(db, userId, sourceId);
    if (!deleted) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to delete source' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sourceId } = await params;
    const body = await request.json();
    const enabled = body?.enabled;
    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Body must include { enabled: true | false }' },
        { status: 400 },
      );
    }
    const userId = await getRequiredUserId();
    const db = getDb();
    const updated = await setSourceEnabled(db, userId, sourceId, enabled);
    if (!updated) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update source' },
      { status: 500 },
    );
  }
}
