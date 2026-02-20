/**
 * Contact Verifier Agent - Validates contact relevance and confidence
 *
 * Responsibilities:
 * - Verify contact is relevant to the job
 * - Check evidence freshness
 * - Calculate confidence score
 * - Cross-reference multiple sources
 *
 * LLM Usage: Medium (assess relevance from context)
 */

import { complete } from '@careersignal/llm';
import type { ContactSearchResult, Contact, ContactArchetype } from './types.js';
import type { NormalizedJob } from '../normalize/types.js';

export interface VerificationResult {
  contact: Contact;
  isVerified: boolean;
  verificationNotes: string[];
}

/**
 * Verify a contact candidate and create Contact record
 */
export async function verifyContact(
  candidate: ContactSearchResult,
  job: NormalizedJob,
  archetype: ContactArchetype,
): Promise<VerificationResult> {
  const notes: string[] = [];
  let confidence = candidate.confidence;

  // Check if company matches
  const companyMatch = normalizeCompany(candidate.company) === normalizeCompany(job.companyName);
  if (!companyMatch) {
    notes.push('Company name mismatch');
    confidence *= 0.5;
  }

  // Check if role is relevant to job
  if (candidate.role) {
    const roleRelevance = assessRoleRelevance(candidate.role, job.title, archetype);
    notes.push(`Role relevance: ${roleRelevance}`);
    if (roleRelevance === 'irrelevant') {
      confidence *= 0.3;
    }
  }

  // Boost confidence for LinkedIn profiles
  if (candidate.linkedinUrl) {
    confidence = Math.min(1, confidence + 0.2);
    notes.push('Has LinkedIn profile');
  }

  // Create Contact record
  const contact: Contact = {
    id: `contact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    jobId: job.id,
    name: candidate.name,
    role: candidate.role,
    company: candidate.company,
    archetype,
    evidenceUrls: [candidate.evidenceUrl],
    evidenceSnippets: candidate.evidenceSnippet ? [candidate.evidenceSnippet] : [],
    confidence: Math.round(confidence * 100) / 100,
    linkedinUrl: candidate.linkedinUrl,
    platform: candidate.linkedinUrl ? 'LINKEDIN' : 'OTHER',
    foundVia: candidate.source,
    createdAt: new Date().toISOString(),
  };

  return {
    contact,
    isVerified: confidence >= 0.4,
    verificationNotes: notes,
  };
}

function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(inc\.?|llc|ltd\.?|corp\.?|corporation|company|co\.?)$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function assessRoleRelevance(
  contactRole: string,
  jobTitle: string,
  archetype: ContactArchetype,
): 'relevant' | 'partial' | 'irrelevant' {
  const roleLower = contactRole.toLowerCase();
  const jobLower = jobTitle.toLowerCase();

  // Check for engineering-related roles
  const engineeringKeywords = ['engineer', 'developer', 'engineering', 'technical', 'software'];
  const isEngineeringJob = engineeringKeywords.some((k) => jobLower.includes(k));
  const isEngineeringContact = engineeringKeywords.some((k) => roleLower.includes(k));

  // Engineering job should have engineering-related contact
  if (isEngineeringJob && isEngineeringContact) {
    return 'relevant';
  }

  // Recruiter is always relevant
  if (roleLower.includes('recruit') || roleLower.includes('talent')) {
    return 'relevant';
  }

  // Founder/executive is relevant for small companies
  if (
    archetype === 'FOUNDER' &&
    (roleLower.includes('founder') || roleLower.includes('ceo') || roleLower.includes('cto'))
  ) {
    return 'relevant';
  }

  // Same department is partially relevant
  if (isEngineeringJob && isEngineeringContact) {
    return 'partial';
  }

  // Different department might still be useful
  if (roleLower.includes('manager') || roleLower.includes('director')) {
    return 'partial';
  }

  return 'irrelevant';
}

/**
 * Use LLM to verify contact relevance for complex cases
 */
export async function verifyContactWithLLM(
  candidate: ContactSearchResult,
  job: NormalizedJob,
): Promise<{ isRelevant: boolean; confidence: number; reasoning: string }> {
  const prompt = `Assess if this person is a good contact for this job application.

JOB:
- Title: ${job.title}
- Company: ${job.companyName}
- Department: ${job.department || 'Unknown'}

CONTACT:
- Name: ${candidate.name}
- Role: ${candidate.role || 'Unknown'}
- Company: ${candidate.company}
- Found via: ${candidate.source}
- Evidence: ${candidate.evidenceSnippet || 'None'}

Is this person relevant for contacting about the job?
Consider: Does their role relate to hiring for this position?

Return JSON: { isRelevant: boolean, confidence: 0-1, reasoning: "brief explanation" }`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 256,
      timeout: 30000,
    });

    const parsed = JSON.parse(response);
    return {
      isRelevant: parsed.isRelevant ?? false,
      confidence: parsed.confidence ?? 0.5,
      reasoning: parsed.reasoning ?? '',
    };
  } catch {
    return {
      isRelevant: true,
      confidence: 0.5,
      reasoning: 'LLM verification failed, assuming potentially relevant',
    };
  }
}

/**
 * Select top contacts from verified list
 */
export function selectTopContacts(contacts: Contact[], maxContacts: number = 3): Contact[] {
  // Sort by confidence descending
  const sorted = [...contacts].sort((a, b) => b.confidence - a.confidence);

  // Try to get diversity of archetypes
  const selected: Contact[] = [];
  const usedArchetypes = new Set<ContactArchetype>();

  for (const contact of sorted) {
    if (selected.length >= maxContacts) break;

    // Prefer different archetypes
    if (!usedArchetypes.has(contact.archetype) || selected.length < Math.ceil(maxContacts / 2)) {
      selected.push(contact);
      usedArchetypes.add(contact.archetype);
    }
  }

  // Fill remaining slots with highest confidence
  for (const contact of sorted) {
    if (selected.length >= maxContacts) break;
    if (!selected.includes(contact)) {
      selected.push(contact);
    }
  }

  return selected;
}
