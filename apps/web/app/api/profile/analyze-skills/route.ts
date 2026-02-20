import { NextResponse } from 'next/server';
import { getDb, getProfileByUserId, updateSuggestedSkills } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { complete, parseJsonResponse } from '@careersignal/llm';
import { z } from 'zod';

const SuggestedSkillsSchema = z.object({
  suggestedSkills: z.array(z.string()),
});

const SKILLS_PROMPT = `You are a career advisor. Based on this profile, suggest 5 to 10 skills the person could learn or add to strengthen their profile. Return only skills that are relevant to their experience and goals. Be specific (e.g. "React" not just "frontend").

Profile summary:
- Work experience: {experienceSummary}
- Projects: {projectsSummary}
- Current skills: {skillsList}

Return JSON with this exact structure:
{
  "suggestedSkills": ["Skill 1", "Skill 2", "Skill 3", ...]
}`;

export async function POST() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const profile = await getProfileByUserId(db, userId);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const experience = (profile.experience ?? []) as Array<{
      title?: string;
      company?: string;
      bullets?: string[];
    }>;
    const experienceSummary =
      experience.length === 0
        ? 'None listed'
        : experience.map((e) => `${e.title || 'Role'} at ${e.company || 'Company'}`).join('; ');

    const projects = (profile.projects ?? []) as Array<{ name?: string; context?: string }>;
    const projectsSummary =
      projects.length === 0 ? 'None listed' : projects.map((p) => p.name || 'Project').join('; ');

    const skillsList = (profile.skills ?? []).length
      ? (profile.skills as string[]).join(', ')
      : 'None listed';

    const prompt = SKILLS_PROMPT.replace('{experienceSummary}', experienceSummary)
      .replace('{projectsSummary}', projectsSummary)
      .replace('{skillsList}', skillsList);

    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.4,
      timeout: 30000,
    });

    const result = parseJsonResponse(response, SuggestedSkillsSchema);
    if (!result.success || !result.data?.suggestedSkills) {
      console.error('Failed to parse suggested skills:', result.error);
      return NextResponse.json({ error: 'Failed to analyze skills' }, { status: 500 });
    }

    const suggestedSkills = result.data.suggestedSkills.filter(
      (s): s is string => typeof s === 'string' && s.trim().length > 0,
    );
    await updateSuggestedSkills(db, userId, suggestedSkills);

    return NextResponse.json({ suggestedSkills });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Analyze skills error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Analysis failed' },
      { status: 500 },
    );
  }
}
