import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getAnalysisById, getProfileByUserId } from '@careersignal/db';
import { complete } from '@careersignal/llm';

export async function POST(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const body = await req.json().catch(() => ({}));

    const analysisId = typeof body?.analysisId === 'string' ? body.analysisId.trim() : '';
    const question = typeof body?.question === 'string' ? body.question.trim() : '';

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId is required' }, { status: 400 });
    }
    if (!question) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    const db = getDb();
    const analysis = await getAnalysisById(db, analysisId);
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const profile = await getProfileByUserId(db, userId);

    const jobSummaryStr = analysis.jobSummary
      ? JSON.stringify(analysis.jobSummary, null, 2)
      : 'No job summary available.';

    const rationaleStr = analysis.matchRationale
      ? `Match Rationale: ${analysis.matchRationale}`
      : 'No match rationale available.';

    // Safely structure profile data
    const safeProfile = {
      name: profile?.name ?? 'User',
      currentTitle: (profile as unknown as { currentTitle?: string })?.currentTitle ?? '',
      location: profile?.location ?? '',
      skills: profile?.skills ?? [],
      experience: profile?.experience ?? [],
    };
    const profileStr = JSON.stringify(safeProfile, null, 2);

    const systemPrompt = `You are an expert career advisor and AI assistant helping a candidate with their job application.

CRITICAL INSTRUCTIONS:
- The user will likely ask you to help draft a response to a specific job application question.
- If they do, GENERATE THE ACTUAL WRITTEN RESPONSE they can copy and paste into the application. 
- Write the response in the FIRST PERSON ("I", "my", "my experience") from the perspective of the user, using their provided profile and the job summary.
- Do NOT just give them advice or tips on how to answer it; instead, write the actual answer for them.
- If they ask a general question instead (e.g., "What are the key skills?"), answer it directly and professionally.

Respond in a formal, professional, friendly, warm, straightforward, enthusiastic, direct, technical, industry-specific, concise, and confident tone.

Use the following context to answer the question:

--- JOB SUMMARY ---
${jobSummaryStr}

--- ANALYSIS MATCH RATIONALE ---
${rationaleStr}

--- USER PROFILE (RESUME) ---
${profileStr}

Answer directly and practically based ONLY on the context provided above. Do not hallucinate information not present in the context.`;

    const answer = await complete(question, 'GENERAL', { system: systemPrompt });

    return NextResponse.json({ answer: answer.trim() });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to ask question' },
      { status: 500 },
    );
  }
}
