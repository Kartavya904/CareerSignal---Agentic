import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import {
  getDb,
  getProfileByUserId,
  getProfileInsightsByUserId,
  getUserById,
  updateProfileResume,
  updateUserMetadata,
  upsertProfileInsights,
} from '@careersignal/db';
import { computeProfileInsights, extractText } from '@careersignal/agents';
import { getUserDataDir, getResumeFullPath } from '@/lib/user-data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';

    let profile = await getProfileByUserId(db, userId);
    if (!profile?.name) {
      return NextResponse.json({ ready: false });
    }

    // Return cached insights when available and not forcing refresh
    if (!forceRefresh) {
      const cached = await getProfileInsightsByUserId(db, userId);
      if (cached?.computedAt) {
        return NextResponse.json(
          {
            totalYearsExperience: cached.totalYearsExperience,
            totalMonthsExperience: cached.totalYearsExperience * 12,
            seniority: cached.seniority,
            keywordDepth: cached.keywordDepth,
            strengthScore: cached.strengthScore,
            overallScore: cached.overallScore,
            resumeRating: cached.resumeRating ?? '',
            insightsGeneratedAt: cached.computedAt.toISOString(),
          },
          { headers: { 'Cache-Control': 'no-store, max-age=0' } },
        );
      }
    }

    let resumeRawText: string | null = profile.resumeRawText ?? null;

    // If DB has no raw text but user has an uploaded resume file, extract and save it now
    if (!resumeRawText?.trim()) {
      const user = await getUserById(db, userId);
      if (user?.email) {
        const userDir = await getUserDataDir(user.email);
        const resumePath = getResumeFullPath(userDir);
        if (resumePath) {
          try {
            const extracted = await extractText(resumePath);
            if (extracted.text?.trim()) {
              await updateProfileResume(db, userId, { resumeRawText: extracted.text });
              resumeRawText = extracted.text;
            }
          } catch (err) {
            console.warn('[profile/insights] Extract from file failed:', err);
          }
        }
      }
    }

    const hasResumeRawText = !!resumeRawText?.trim();
    const resumeRawTextLength = resumeRawText?.length ?? 0;

    if (!hasResumeRawText) {
      console.warn(
        '[profile/insights] No resume raw text in DB (resumeRawTextLength=0). Parse resume first so the agent can run. userId=',
        userId,
      );
    }

    // Use work experience only (not projects) for years/seniority; agent returns scores 0–100
    const experience = (profile.experience ?? []) as unknown[];
    const skills = (profile.skills ?? []) as string[];

    const insights = await computeProfileInsights({
      experience,
      skills,
      resumeRawText,
    });

    await upsertProfileInsights(db, userId, {
      totalYearsExperience: insights.totalYearsExperience,
      seniority: insights.seniority,
      keywordDepth: insights.keywordDepth,
      strengthScore: insights.strengthScore,
      overallScore: insights.overallScore,
      resumeRating: insights.resumeRating,
    });

    const insightsGeneratedAt = new Date();
    await updateUserMetadata(db, userId, { insightsGeneratedAt });

    const json = {
      totalYearsExperience: insights.totalYearsExperience,
      totalMonthsExperience: insights.totalMonthsExperience,
      seniority: insights.seniority,
      keywordDepth: insights.keywordDepth,
      strengthScore: insights.strengthScore,
      overallScore: insights.overallScore,
      resumeRating: insights.resumeRating,
      insightsGeneratedAt: insightsGeneratedAt.toISOString(),
      _debug: {
        hasResumeRawText,
        resumeRawTextLength,
        agentRanLLM: hasResumeRawText,
      },
    };

    return NextResponse.json(json, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to compute insights' },
      { status: 500 },
    );
  }
}
