import { NextResponse } from 'next/server';
import { getDb, getProfileByUserId } from '@careersignal/db';
import { buildPreferencesFromProfile } from '@careersignal/agents';
import { getRequiredUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Returns full preferences shape built from current profile (for one-shot auto-populate). */
export async function POST() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const profile = await getProfileByUserId(db, userId);
    if (!profile) {
      return NextResponse.json(
        { error: 'No profile found. Create a profile first.' },
        { status: 400 },
      );
    }
    const result = await buildPreferencesFromProfile({
      name: profile.name,
      location: profile.location ?? undefined,
      workAuthorization: profile.workAuthorization ?? undefined,
      skills: (profile.skills as string[]) ?? [],
      experience:
        (profile.experience as {
          title: string;
          company: string;
          startDate?: string;
          endDate?: string;
        }[]) ?? [],
      education:
        (profile.education as { institution: string; degree?: string; field?: string }[]) ?? [],
      targetRoles: (profile.targetRoles as string[]) ?? [],
    });
    const p = result.preferences;
    const targetLocations = (p.targetLocations ?? []).map((loc) =>
      typeof loc === 'string'
        ? { country: loc }
        : { country: loc.country, state: loc.state, city: loc.city },
    );
    return NextResponse.json({
      work_authorization: profile.workAuthorization ?? 'OTHER',
      target_locations: targetLocations,
      remote_preference: profile.remotePreference ?? 'ANY',
      target_seniority: p.targetSeniority ?? [],
      target_roles: p.targetRoles ?? (profile.targetRoles as string[]) ?? [],
      skills: p.skills ?? (profile.skills as string[]) ?? [],
      industries: p.industries ?? (profile.industries as string[]) ?? [],
      employment_types: (profile.employmentType as string[]) ?? [],
      strict_filter_level: 'STRICT',
      max_contacts_per_job: 2,
      outreach_tone: 'PROFESSIONAL_CONCISE',
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build preferences from profile' },
      { status: 500 },
    );
  }
}
