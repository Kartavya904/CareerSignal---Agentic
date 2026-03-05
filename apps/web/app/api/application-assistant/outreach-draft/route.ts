/**
 * POST /api/application-assistant/outreach-draft
 * Create a single outreach draft for one ranked contact (on-demand).
 * Body: { analysisId: string, contactIndex: number }
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
import type { Contact } from '@careersignal/agents';
import type { NormalizedJob } from '@careersignal/agents';
import type { OutreachTone } from '@careersignal/agents';

function mapOutreachTone(pref: string | null | undefined): OutreachTone {
  if (pref === 'WARM' || pref === 'TECHNICAL') return pref;
  return 'CONCISE';
}

function toNormalizedJob(
  analysisId: string,
  jobSummary: Record<string, unknown>,
  url: string,
): NormalizedJob {
  const t = new Date().toISOString();
  return {
    id: analysisId,
    runId: analysisId,
    sourceId: url,
    title: String(jobSummary.title ?? ''),
    companyName: String(jobSummary.company ?? ''),
    sourceUrl: url,
    description: typeof jobSummary.description === 'string' ? jobSummary.description : undefined,
    department: typeof jobSummary.department === 'string' ? jobSummary.department : 'Engineering',
    applyUrl: url,
    dedupeKey: url,
    createdAt: t,
    updatedAt: t,
  } as NormalizedJob;
}

function rankedItemToContact(
  item: Record<string, unknown>,
  jobId: string,
  companyName: string,
): Contact {
  const now = new Date().toISOString();
  const linkedinUrl = typeof item.linkedinUrl === 'string' ? item.linkedinUrl : undefined;
  return {
    id: typeof item.id === 'string' ? item.id : `contact-${now}`,
    jobId,
    name: String(item.name ?? '—'),
    role: typeof item.role === 'string' ? item.role : undefined,
    company: String(item.company ?? companyName),
    archetype: 'FALLBACK',
    evidenceUrls: Array.isArray(item.evidenceUrls) ? (item.evidenceUrls as string[]) : [],
    evidenceSnippets: Array.isArray(item.evidenceSnippets)
      ? (item.evidenceSnippets as string[])
      : [],
    confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
    linkedinUrl,
    email: typeof item.email === 'string' ? item.email : undefined,
    platform: linkedinUrl ? 'LINKEDIN' : 'EMAIL',
    foundVia: 'outreach',
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
  } as Contact;
}

export async function POST(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const body = await req.json().catch(() => ({}));
    const analysisId = typeof body?.analysisId === 'string' ? body.analysisId.trim() : '';
    const contactIndex = typeof body?.contactIndex === 'number' ? body.contactIndex : 0;

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
    const draft = await generateSingleDraftForContact(
      normalizedJob,
      contact,
      candidateName,
      candidateSkills,
      hooks,
      outreachTone,
    );

    const serializedDraft = {
      id: draft.id,
      contactId: contact.id,
      contactName: contact.name,
      platform: draft.platform,
      variant: draft.variant,
      subject: draft.subject,
      body: draft.body,
      tone: draft.tone,
      characterCount: draft.characterCount,
      withinLimit: draft.withinLimit,
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
