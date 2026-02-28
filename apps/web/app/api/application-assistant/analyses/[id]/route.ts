import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getAnalysisById, deleteAnalysisById } from '@careersignal/db';
import { deleteRunFolder } from '@/lib/application-assistant-disk';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getRequiredUserId();
    const { id } = await params;
    const db = getDb();
    const analysis = await getAnalysisById(db, id);
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const matchScore =
      typeof analysis.matchScore === 'string' ? Number(analysis.matchScore) : analysis.matchScore;
    return NextResponse.json({ ...analysis, matchScore });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/** Delete one analysis (and its run folder) for the current user. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getRequiredUserId();
    const { id } = await params;
    const db = getDb();
    const deleted = await deleteAnalysisById(db, id, userId);
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (deleted.runFolderName) {
      try {
        await deleteRunFolder(deleted.runFolderName);
      } catch {
        // ignore missing or permission errors
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
