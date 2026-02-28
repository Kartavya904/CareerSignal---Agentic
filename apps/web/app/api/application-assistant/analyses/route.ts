import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, listAnalysesByUser, deleteAllAnalysesForUser } from '@careersignal/db';
import { deleteRunFolder } from '@/lib/application-assistant-disk';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const rows = await listAnalysesByUser(db, userId);
    const analyses = rows.map((a) => ({
      ...a,
      matchScore: typeof a.matchScore === 'string' ? Number(a.matchScore) : a.matchScore,
    }));
    return NextResponse.json({ analyses });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[application-assistant/analyses]', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/** Delete all analyses for the current user and their run folders. */
export async function DELETE() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const deleted = await deleteAllAnalysesForUser(db, userId);
    for (const { runFolderName } of deleted) {
      if (runFolderName) {
        try {
          await deleteRunFolder(runFolderName);
        } catch {
          // ignore missing or permission errors
        }
      }
    }
    return NextResponse.json({ deleted: deleted.length });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
