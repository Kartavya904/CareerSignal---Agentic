/**
 * POST /api/application-assistant/regenerate-cover-letter
 * Regenerates only the cover letter for an existing analysis using stored job/profile/company
 * and optional user instruction. Writes to analysis.coverLetters (single "draft" key).
 */

import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import {
  getDb,
  getAnalysisById,
  getProfileByUserId,
  getPreferencesByUserId,
  updateAnalysis,
} from '@careersignal/db';
import { generateSingleCoverLetter } from '@careersignal/agents';
import type { JobDetail, ProfileSnapshot } from '@careersignal/agents';

export const dynamic = 'force-dynamic';

function jobSummaryToJobDetail(summary: Record<string, unknown> | null): JobDetail | null {
  if (!summary || typeof summary.title !== 'string' || typeof summary.company !== 'string')
    return null;
  return {
    title: String(summary.title),
    company: String(summary.company),
    companyOneLiner: summary.companyOneLiner != null ? String(summary.companyOneLiner) : null,
    location: summary.location != null ? String(summary.location) : null,
    salary: summary.salary != null ? String(summary.salary) : null,
    description: typeof summary.description === 'string' ? summary.description : '',
    requirements: Array.isArray(summary.requirements) ? summary.requirements.map(String) : [],
    postedDate: summary.postedDate != null ? String(summary.postedDate) : null,
    deadline: summary.deadline != null ? String(summary.deadline) : null,
    employmentType: summary.employmentType != null ? String(summary.employmentType) : null,
    remoteType: summary.remoteType != null ? String(summary.remoteType) : null,
    seniority: summary.seniority != null ? String(summary.seniority) : null,
    applyUrl: summary.applyUrl != null ? String(summary.applyUrl) : null,
    department: summary.department != null ? String(summary.department) : null,
  };
}

export async function POST(request: Request) {
  try {
    const userId = await getRequiredUserId();
    const body = await request.json().catch(() => ({}));
    const analysisId = body.analysisId ?? body.analysis_id;
    const userInstruction = typeof body.userInstruction === 'string' ? body.userInstruction : null;

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId is required' }, { status: 400 });
    }

    const db = getDb();
    const analysis = await getAnalysisById(db, analysisId);
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const jobDetail = jobSummaryToJobDetail(analysis.jobSummary);
    if (!jobDetail) {
      return NextResponse.json(
        { error: 'Analysis has no job details; cannot regenerate cover letter.' },
        { status: 400 },
      );
    }

    const profile = await getProfileByUserId(db, userId);
    if (!profile?.name) {
      return NextResponse.json(
        { error: 'No profile found. Add a profile to regenerate a personalized cover letter.' },
        { status: 400 },
      );
    }

    const preferences = await getPreferencesByUserId(db, userId);
    const prefs = preferences as {
      coverLetterTone?: string[];
      coverLetterLength?: string;
      coverLetterWordChoice?: string[];
      coverLetterNotes?: string | null;
    } | null;

    const profileSnapshot: ProfileSnapshot = {
      name: profile.name,
      location: profile.location ?? null,
      workAuthorization: profile.workAuthorization ?? null,
      seniority: profile.seniority ?? null,
      targetRoles: (profile.targetRoles as string[]) ?? [],
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
      resumeRawText: profile.resumeRawText ?? null,
    };

    const coverLetters = await generateSingleCoverLetter(profileSnapshot, jobDetail, {
      companyResearch: analysis.companyResearch ?? undefined,
      style:
        prefs?.coverLetterTone != null || prefs?.coverLetterNotes != null
          ? {
              tone: prefs.coverLetterTone ?? undefined,
              length: (prefs.coverLetterLength as 'CONCISE' | 'DEFAULT' | 'DETAILED') ?? undefined,
              wordChoice: prefs.coverLetterWordChoice ?? undefined,
              notes: prefs.coverLetterNotes ?? undefined,
            }
          : undefined,
      userInstruction: userInstruction ?? undefined,
    });

    const coverLettersEvidence = {
      model: 'GENERAL',
      summary: userInstruction
        ? 'Cover letter regenerated with your instructions.'
        : 'Cover letter regenerated.',
      singleDraft: true,
    };

    await updateAnalysis(db, analysisId, {
      coverLetters,
      coverLettersEvidence,
    });

    return NextResponse.json({
      ok: true,
      coverLetters,
      message: 'Cover letter regenerated.',
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[regenerate-cover-letter]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to regenerate cover letter' },
      { status: 500 },
    );
  }
}
