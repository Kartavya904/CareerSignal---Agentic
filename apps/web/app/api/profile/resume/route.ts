import { NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import {
  getDb,
  getUserById,
  getProfileByUserId,
  updateProfileResume,
  updateUserMetadata,
} from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { getUserDataDir, getResumeFilePath, getResumeFilename } from '@/lib/user-data';
import { extractText } from '@careersignal/agents';
import path from 'path';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const user = await getUserById(db, userId);

    if (!user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('resume') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size: 10MB' }, { status: 400 });
    }

    const userDir = await getUserDataDir(user.email);

    // Remove any existing resume files
    for (const existingExt of ALLOWED_EXTENSIONS) {
      const existingPath = path.join(userDir, `resume${existingExt}`);
      if (existsSync(existingPath)) {
        await unlink(existingPath);
      }
    }

    // Save new resume
    const resumePath = getResumeFilePath(userDir, file.name);
    const bytes = await file.arrayBuffer();
    await writeFile(resumePath, Buffer.from(bytes));

    // Extract raw text and save to profile so AI Insights and parse have it; keep other profile fields intact
    const profile = await getProfileByUserId(db, userId);
    if (profile) {
      try {
        const extracted = await extractText(resumePath);
        await updateProfileResume(db, userId, {
          resumeFileRef: `resume${ext}`,
          resumeRawText: extracted.text,
        });
      } catch (err) {
        console.warn('[profile/resume] Extract text failed, continuing. Parse will retry.', err);
        await updateProfileResume(db, userId, { resumeFileRef: `resume${ext}` });
      }
      await updateUserMetadata(db, userId, { resumeUploadedAt: new Date() });
    }

    return NextResponse.json({
      success: true,
      filename: `resume${ext}`,
      message:
        'Resume uploaded successfully. Click Parse to extract experience, skills, and education.',
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to upload resume' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const user = await getUserById(db, userId);

    if (!user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    const userDir = await getUserDataDir(user.email);
    const resumeFilename = getResumeFilename(userDir);

    return NextResponse.json({
      hasResume: !!resumeFilename,
      filename: resumeFilename,
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to check resume' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const user = await getUserById(db, userId);

    if (!user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    const userDir = await getUserDataDir(user.email);

    // Remove all resume files
    for (const ext of ALLOWED_EXTENSIONS) {
      const resumePath = path.join(userDir, `resume${ext}`);
      if (existsSync(resumePath)) {
        await unlink(resumePath);
      }
    }

    // Clear only resume-related fields; keep experience, education, skills, etc.
    const profile = await getProfileByUserId(db, userId);
    if (profile) {
      await upsertProfile(db, userId, {
        name: profile.name,
        location: profile.location,
        workAuthorization: profile.workAuthorization,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        seniority: profile.seniority ?? null,
        targetRoles: (profile.targetRoles as string[]) ?? [],
        skills: (profile.skills as string[]) ?? [],
        highlightedSkills: (profile.highlightedSkills as string[]) ?? [],
        suggestedSkills: (profile.suggestedSkills as string[]) ?? [],
        experience: (profile.experience as unknown[]) ?? [],
        education: (profile.education as unknown[]) ?? [],
        projects: (profile.projects as unknown[]) ?? [],
        certifications: (profile.certifications as string[]) ?? [],
        industries: (profile.industries as string[]) ?? [],
        languages: (profile.languages as string[]) ?? [],
        employmentType: (profile.employmentType as string[]) ?? [],
        remotePreference: profile.remotePreference ?? null,
        linkedinUrl: profile.linkedinUrl ?? null,
        githubUrl: profile.githubUrl ?? null,
        portfolioUrl: profile.portfolioUrl ?? null,
        resumeRawText: null,
        resumeFileRef: null,
        resumeParsedAt: null,
      });
    }

    return NextResponse.json({ success: true, message: 'Resume deleted' });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to delete resume' },
      { status: 500 },
    );
  }
}
