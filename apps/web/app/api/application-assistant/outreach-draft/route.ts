/**
 * POST /api/application-assistant/outreach-draft
 * Create a single outreach draft for one ranked contact (on-demand).
 * Body: { analysisId: string, contactIndex: number, userInstruction?: string }
 * Returns: { draft: { platform, variant, body, subject?, tone, ... } }
 * Persists the draft to analysis.contacts.drafts and returns it.
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
import { extractHooks, generateSingleDraftForContact } from '@careersignal/agents';
import type { OutreachTone } from '@careersignal/agents';
import { toNormalizedJob, rankedItemToContact } from '@/lib/outreach-draft-helpers';

function mapOutreachTone(pref: string | null | undefined): OutreachTone {
  if (pref === 'WARM' || pref === 'TECHNICAL') return pref;
  return 'CONCISE';
}

export async function POST(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const body = await req.json().catch(() => ({}));
    const analysisId = typeof body?.analysisId === 'string' ? body.analysisId.trim() : '';
    const contactIndex = typeof body?.contactIndex === 'number' ? body.contactIndex : 0;
    const userInstruction =
      typeof body?.userInstruction === 'string' ? body.userInstruction.trim() : '';

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId is required' }, { status: 400 });
    }

    const db = getDb();
    const analysis = await getAnalysisById(db, analysisId);
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const contacts = (analysis.contacts as Record<string, unknown> | null) ?? {};
    const ranked = (Array.isArray(contacts.ranked) ? contacts.ranked : []) as Record<
      string,
      unknown
    >[];
    const contactItem = ranked[contactIndex];
    if (!contactItem) {
      return NextResponse.json(
        { error: `Contact at index ${contactIndex} not found. Ranked contacts: ${ranked.length}.` },
        { status: 400 },
      );
    }

    const jobSummary = (analysis.jobSummary as Record<string, unknown>) ?? {};
    const companyName = String(jobSummary.company ?? '');
    const url = typeof analysis.url === 'string' ? analysis.url : '';

    const profile = await getProfileByUserId(db, userId);
    const prefs = await getPreferencesByUserId(db, userId);
    const candidateName = profile?.name ?? 'Candidate';
    const candidateSkills = (profile?.skills as string[]) ?? (prefs?.skills as string[]) ?? [];

    const normalizedJob = toNormalizedJob(analysisId, jobSummary, url);
    const contact = rankedItemToContact(contactItem, analysisId, companyName);

    const hooks = await extractHooks(normalizedJob, contact, candidateSkills);
    const outreachTone = mapOutreachTone(prefs?.outreachTone ?? undefined);

    const toneAdjectives = contact.linkedinUrl
      ? ((prefs as { coldLinkedinTone?: string[] | null } | null)?.coldLinkedinTone ?? [])
      : ((prefs as { coldEmailTone?: string[] | null } | null)?.coldEmailTone ?? []);

    const draft = await generateSingleDraftForContact(
      normalizedJob,
      contact,
      candidateName,
      candidateSkills,
      hooks,
      {
        tone: outreachTone,
        toneAdjectives: Array.isArray(toneAdjectives) ? toneAdjectives : [],
        userInstruction: userInstruction || null,
      },
    );

    const serializedDraft = {
      id: draft.id,
      contactId: contact.id,
      contactName: contact.name,
      contactIndex,
      platform: draft.platform,
      variant: draft.variant,
      subject: draft.subject,
      body: draft.body,
      tone: draft.tone,
      characterCount: draft.characterCount,
      withinLimit: draft.withinLimit,
      userInstruction: userInstruction || null,
      createdAt: draft.createdAt,
    };

    const existingDrafts = Array.isArray(contacts.drafts) ? (contacts.drafts as unknown[]) : [];
    const newContacts = {
      ...contacts,
      drafts: [...existingDrafts, serializedDraft],
    };

    await updateAnalysis(db, analysisId, { contacts: newContacts });

    return NextResponse.json({ draft: serializedDraft });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create outreach draft' },
      { status: 500 },
    );
  }
}
