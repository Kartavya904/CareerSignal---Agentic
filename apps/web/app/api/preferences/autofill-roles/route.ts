import { NextResponse } from 'next/server';
import { getDb, getProfileByUserId } from '@careersignal/db';
import { buildPreferencesFromProfile } from '@careersignal/agents';
import { getRequiredUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Returns suggested target roles (e.g. top 5) from profile / preference builder. */
export async function POST() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const profile = await getProfileByUserId(db, userId);
    if (!profile) {
      return NextResponse.json({ target_roles: [] });
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
    const roles = result.preferences.targetRoles ?? [];
    const top = roles.slice(0, 5);
    return NextResponse.json({ target_roles: top });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to autofill roles' },
      { status: 500 },
    );
  }
}
