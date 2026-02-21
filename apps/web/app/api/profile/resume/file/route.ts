import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getUserById } from '@careersignal/db';
import { getUserDataDir, getResumeFullPath } from '@/lib/user-data';
import path from 'path';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
};

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const user = await getUserById(db, userId);
    if (!user?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }
    const userDir = await getUserDataDir(user.email);
    const resumePath = getResumeFullPath(userDir);
    if (!resumePath) {
      return NextResponse.json({ error: 'No resume file' }, { status: 404 });
    }
    const ext = path.extname(resumePath).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    const buffer = await readFile(resumePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `inline; filename="resume${ext}"`,
      },
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load file' },
      { status: 500 },
    );
  }
}
