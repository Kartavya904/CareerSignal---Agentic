import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

/**
 * Placeholder API for the Contact / Outreach pipeline.
 * Used by the admin ContactOutreachPanel to test the flow.
 * Replace with real contact discovery + outreach generation when Phase 17+ is implemented.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const _jobUrl = typeof body.jobUrl === 'string' ? body.jobUrl.trim() : '';

  return NextResponse.json({
    placeholder: true,
    message:
      'Contact pipeline is not yet built. This is a placeholder for testing. Phase 17 (email pattern + contact ranking) and Phase 18 (outreach generation) will implement the full flow.',
  });
}
