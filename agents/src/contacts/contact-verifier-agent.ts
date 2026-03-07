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

const ARCHETYPE_PRIORITY: Record<ContactArchetype, number> = {
  HIRING_MANAGER: 1,
  ENG_MANAGER: 2,
  TEAM_LEAD: 3,
  TECH_RECRUITER: 4,
  CAMPUS_RECRUITER: 5,
  FOUNDER: 6,
  FALLBACK: 7,
};

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
    contactRole: candidate.contactRole || candidate.role,
    company: candidate.company,
    archetype,
    evidenceUrls: [candidate.evidenceUrl],
    evidenceSnippets: candidate.evidenceSnippet ? [candidate.evidenceSnippet] : [],
    confidence: Math.round(confidence * 100) / 100,
    linkedinUrl: candidate.linkedinUrl,
    platform: candidate.linkedinUrl ? 'LINKEDIN' : 'OTHER',
    location: candidate.location,
    foundVia: candidate.source,
    createdAt: new Date().toISOString(),
  };

  // Check for location match
  if (candidate.location && job.location) {
    const jobLocLower = job.location.toLowerCase();
    const candLocLower = candidate.location.toLowerCase();
    
    // Simple heuristic: check if any significant keywords match
    const jobLocParts = jobLocLower.split(/[,|\s]+/).filter(p => p.length > 2);
    const hasMatch = jobLocParts.some(p => candLocLower.includes(p));
    
    if (hasMatch) {
      notes.push(`Location matches: ${candidate.location}`);
      confidence = Math.min(1, confidence + 0.15);
    }
  }

  contact.confidence = Math.round(confidence * 100) / 100;
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
 * Select top contacts from verified list with specific diversity quotas.
 * Requested split for 15 slots:
 * - 3 Hiring Manager (HM)
 * - 2 Engineering Manager (EM)
 * - 2 Team Lead / Senior Engineer (TL)
 * - 2 Technical Recruiter (TR)
 * - 2 University/Campus Recruiter (UR)
 * - 1 Founder (F)
 * = 12 reserved slots. Remaining 3 are open to next best.
 */
export function selectTopContacts(contacts: Contact[], maxContacts: number = 3): Contact[] {
  if (contacts.length === 0) return [];

  // 1. Sort primarily by confidence (best candidates first)
  const sorted = [...contacts].sort((a, b) => {
    // Very slight bias for contacts with location info to break ties or near-ties
    // (Note: verifyContact already boosted confidence for location matches)
    const aScore = a.confidence + (a.location ? 0.001 : 0);
    const bScore = b.confidence + (b.location ? 0.001 : 0);
    return bScore - aScore;
  });


  // 2. Define quotas (targeted for max 15, but logic handles scaling)
  const quotas: Record<ContactArchetype, number> = {
    HIRING_MANAGER: 3,
    ENG_MANAGER: 2,
    TEAM_LEAD: 2,
    TECH_RECRUITER: 2,
    CAMPUS_RECRUITER: 2,
    FOUNDER: 1,
    FALLBACK: 0
  };

  const selected: Contact[] = [];
  const counts: Record<string, number> = {};
  for (const arch of Object.keys(quotas)) counts[arch] = 0;

  // First pass: Fill quotas with highest confidence candidates for each archetype
  // (Scale quotas down if maxContacts < 12, but user requested 15)
  for (const contact of sorted) {
    if (selected.length >= maxContacts) break;
    const arch = contact.archetype;
    const quota = quotas[arch] || 0;
    
    // If we're picking very few (e.g. 3), don't fill all slots with one type
    const limitForThisArch = maxContacts > 5 ? quota : 1;

    if (counts[arch] < limitForThisArch) {
      selected.push(contact);
      counts[arch]++;
    }
  }

  // Second pass: Fill remaining slots with the highest confidence contacts from any archetype
  for (const contact of sorted) {
    if (selected.length >= maxContacts) break;
    if (!selected.find(s => s.id === contact.id)) {
      selected.push(contact);
    }
  }

  // Final re-sort of the selected list to ensure variation in the first few results
  const result: Contact[] = [];

  // A. "Diversity Top 6": Take one of each available type in priority order first
  const priorityOrder: ContactArchetype[] = [
    'HIRING_MANAGER', 
    'ENG_MANAGER', 
    'TEAM_LEAD', 
    'TECH_RECRUITER', 
    'CAMPUS_RECRUITER', 
    'FOUNDER'
  ];
  
  for (const type of priorityOrder) {
    const firstMatch = selected.find(c => c.archetype === type && !result.find(r => r.id === c.id));
    if (firstMatch) {
      result.push(firstMatch);
    }
  }

  // B. Fill the rest of the result list from the 'selected' pool in original relative order (confidence-pushed)
  for (const contact of selected) {
    if (!result.find(s => s.id === contact.id)) {
      result.push(contact);
    }
  }

  // Assign numerical ranks 1-N
  return result.slice(0, maxContacts).map((c, i) => ({
    ...c,
    rank: i + 1
  }));
}
