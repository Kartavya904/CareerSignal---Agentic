import { getRequiredUserId } from '@/lib/auth';
import { getProgress } from '@/lib/parse-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userId = await getRequiredUserId();
    const url = new URL(request.url);
    const after = parseInt(url.searchParams.get('after') ?? '-1', 10);
    const result = getProgress(userId, after);
    if (!result) {
      return Response.json({ entries: [], done: false, exists: false });
    }
    return Response.json({ ...result, exists: true });
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
