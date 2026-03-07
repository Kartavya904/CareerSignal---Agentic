/**
 * Shared helpers for building NormalizedJob and Contact for outreach draft generation.
 * Used by the outreach-draft API route and by the application-assistant runner (best-contact draft).
 */

import type { Contact, NormalizedJob } from '@careersignal/agents';

export function toNormalizedJob(
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

export function rankedItemToContact(
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
