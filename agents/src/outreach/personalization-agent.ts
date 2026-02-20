/**
 * Personalization Agent - Injects job-specific hooks into drafts
 *
 * Responsibilities:
 * - Extract personalization hooks from job/company
 * - Find recent news or events
 * - Identify shared interests or connections
 *
 * LLM Usage: Heavy (extract and generate hooks)
 */

import { complete } from '@careersignal/llm';
import type { NormalizedJob } from '../normalize/types.js';
import type { Contact } from '../contacts/types.js';
import type { PersonalizationHook } from './types.js';

/**
 * Extract personalization hooks from job and contact
 */
export async function extractHooks(
  job: NormalizedJob,
  contact: Contact,
  candidateSkills: string[],
): Promise<PersonalizationHook[]> {
  const hooks: PersonalizationHook[] = [];

  // Extract from job description
  const jobHooks = await extractJobHooks(job, candidateSkills);
  hooks.push(...jobHooks);

  // Extract from company (placeholder - would search for recent news)
  const companyHooks = extractCompanyHooks(job.companyName);
  hooks.push(...companyHooks);

  // Extract from contact role
  const contactHooks = extractContactHooks(contact);
  hooks.push(...contactHooks);

  return hooks;
}

async function extractJobHooks(
  job: NormalizedJob,
  candidateSkills: string[],
): Promise<PersonalizationHook[]> {
  if (!job.description) return [];

  const prompt = `Extract personalization hooks from this job description for an outreach message.

Job: ${job.title} at ${job.companyName}

Description:
${job.description.substring(0, 2000)}

Candidate's skills: ${candidateSkills.slice(0, 10).join(', ')}

Find hooks that:
1. Specific technologies/projects mentioned that match candidate skills
2. Interesting challenges or initiatives
3. Team or culture highlights
4. Growth/impact opportunities

Return JSON array: [{ type: "tech"|"team"|"company"|"job", hook: "brief hook text" }]
Maximum 3 hooks.`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.3,
      maxTokens: 512,
      timeout: 30000,
    });

    const parsed = JSON.parse(response);
    const hooks = Array.isArray(parsed) ? parsed : [];

    return hooks.slice(0, 3).map((h: { type?: string; hook?: string }) => ({
      type: (h.type as PersonalizationHook['type']) || 'job',
      hook: h.hook || '',
      source: 'job_description',
    }));
  } catch {
    return [];
  }
}

function extractCompanyHooks(companyName: string): PersonalizationHook[] {
  // Placeholder - would search for recent news, press releases, etc.
  // For now, return generic company-based hooks
  return [
    {
      type: 'company',
      hook: `Impressed by ${companyName}'s growth and engineering culture`,
      source: 'company_research',
    },
  ];
}

function extractContactHooks(contact: Contact): PersonalizationHook[] {
  const hooks: PersonalizationHook[] = [];

  if (contact.role) {
    // If contact is in a leadership role
    if (
      contact.role.toLowerCase().includes('manager') ||
      contact.role.toLowerCase().includes('director') ||
      contact.role.toLowerCase().includes('lead')
    ) {
      hooks.push({
        type: 'shared_interest',
        hook: `Interested in learning about your team's approach to engineering`,
        source: 'contact_role',
      });
    }
  }

  return hooks;
}

/**
 * Inject hooks into a draft message
 */
export function injectHooks(draftBody: string, hooks: PersonalizationHook[]): string {
  if (hooks.length === 0) return draftBody;

  // Find a good insertion point (after greeting, before main ask)
  const lines = draftBody.split('\n');

  // Simple approach: inject after first sentence
  const firstPeriod = draftBody.indexOf('.');
  if (firstPeriod > 0 && hooks[0]) {
    const hookSentence = ` ${hooks[0].hook}.`;
    return draftBody.slice(0, firstPeriod + 1) + hookSentence + draftBody.slice(firstPeriod + 1);
  }

  return draftBody;
}

/**
 * Score a draft for personalization quality
 */
export function scorePersonalization(
  draft: string,
  hooks: PersonalizationHook[],
): { score: number; feedback: string[] } {
  const feedback: string[] = [];
  let score = 50; // Base score

  // Check for generic phrases (negative)
  const genericPhrases = [
    'i came across',
    'i saw your profile',
    'i noticed',
    'i hope this finds you well',
    'i would like to',
  ];

  for (const phrase of genericPhrases) {
    if (draft.toLowerCase().includes(phrase)) {
      score -= 10;
      feedback.push(`Avoid generic phrase: "${phrase}"`);
    }
  }

  // Check for hook usage (positive)
  for (const hook of hooks) {
    if (draft.toLowerCase().includes(hook.hook.toLowerCase().substring(0, 20))) {
      score += 15;
      feedback.push(`Good: Uses personalization hook`);
    }
  }

  // Check for company/job specifics (positive)
  if (/specific|particular|your|team|product|platform/i.test(draft)) {
    score += 10;
    feedback.push(`Good: Contains specific references`);
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    feedback,
  };
}
