import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

/** Stub: Run company enrichment (Phase 14 will implement). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !user.admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ error: 'Not implemented yet', id: params.id }, { status: 501 });
}
