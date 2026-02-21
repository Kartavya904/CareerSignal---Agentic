import { getRequiredUserId } from '@/lib/auth';
import { getStatus } from '@/lib/parse-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const status = getStatus(userId);
    if (!status) {
      return Response.json({
        exists: false,
        active: false,
        done: false,
        step: null,
        entryCount: 0,
      });
    }
    return Response.json({ exists: true, ...status });
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
