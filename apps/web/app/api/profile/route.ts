import { NextResponse } from 'next/server';
import { getDb, getProfileByUserId, upsertProfile } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { profileInputSchema } from '@careersignal/schemas';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const profile = await getProfileByUserId(db, userId);
    return NextResponse.json(profile ?? null);
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
      resumeRawText: data.resume_raw_text ?? null,
      resumeFileRef: data.resume_file_ref ?? null,
    });
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
