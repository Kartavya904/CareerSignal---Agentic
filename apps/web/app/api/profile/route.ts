import { NextResponse } from 'next/server';
import {
  getDb,
  getProfileByUserId,
  resetProfile,
  updateUserMetadata,
  upsertProfile,
} from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { profileInputSchema } from '@careersignal/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const profile = await getProfileByUserId(db, userId);
    return NextResponse.json(profile ?? null, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load profile' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = profileInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const userId = await getRequiredUserId();
    const db = getDb();
    const data = parsed.data;
    const existing = await getProfileByUserId(db, userId);
    // Preserve resume raw text and file ref when client doesn't send them (e.g. form save after parse)
    const resumeRawText =
      data.resume_raw_text !== undefined ? data.resume_raw_text : (existing?.resumeRawText ?? null);
    const resumeFileRef =
      data.resume_file_ref !== undefined ? data.resume_file_ref : (existing?.resumeFileRef ?? null);
    const resumeParsedAt =
      data.resume_parsed_at !== undefined
        ? data.resume_parsed_at
        : (existing?.resumeParsedAt ?? null);

    const profile = await upsertProfile(db, userId, {
      name: data.name,
      location: data.location,
      workAuthorization: data.work_authorization,
      email: data.email ?? null,
      phone: data.phone ?? null,
      seniority: data.seniority ?? null,
      targetRoles: data.target_roles,
      skills: data.skills,
      highlightedSkills: data.highlighted_skills,
      experience: data.experience as unknown[],
      education: data.education as unknown[],
      projects: data.projects as unknown[],
      certifications: data.certifications,
      industries: data.industries,
      languages: data.languages,
      salaryRange: data.salary_range ?? null,
      employmentType: data.employment_type,
      remotePreference: data.remote_preference ?? null,
      linkedinUrl: data.linkedin_url || null,
      githubUrl: data.github_url || null,
      portfolioUrl: data.portfolio_url || null,
      resumeRawText,
      resumeFileRef,
      resumeParsedAt,
    });
    await updateUserMetadata(db, userId, { profileUpdatedAt: new Date() });
    return NextResponse.json(profile);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save profile' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    await resetProfile(db, userId);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to reset profile' },
      { status: 500 },
    );
  }
}
