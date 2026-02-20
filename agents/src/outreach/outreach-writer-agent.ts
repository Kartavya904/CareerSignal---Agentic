/**
 * Outreach Writer Agent - Generates draft message variants
 *
 * Responsibilities:
 * - Generate 2-3 message variants per contact
 * - Apply platform character limits
 * - Support multiple tones (concise, warm, technical)
 *
 * LLM Usage: Heavy (core function is LLM generation)
 */

import { complete } from '@careersignal/llm';
import type { NormalizedJob } from '../normalize/types.js';
import type { Contact } from '../contacts/types.js';
import type {
  OutreachDraft,
  OutreachPlatform,
  OutreachTone,
  PersonalizationHook,
} from './types.js';
import { PLATFORM_LIMITS } from './types.js';

export interface DraftGenerationResult {
  drafts: OutreachDraft[];
  errors: string[];
}

const TONE_PROMPTS: Record<OutreachTone, string> = {
  CONCISE: 'Be brief and direct. Get to the point quickly. Professional but not cold.',
  WARM: 'Be friendly and personable. Show genuine interest. Conversational tone.',
  TECHNICAL:
    'Lead with technical skills and achievements. Reference specific technologies. Appeal to engineering mindset.',
};

const LINKEDIN_CONNECTION_PROMPT = `Write a LinkedIn connection request for a job opportunity.

CANDIDATE:
- Name: {candidateName}
- Target Role: {targetRole}
- Key Skills: {skills}

CONTACT:
- Name: {contactName}
- Role: {contactRole}
- Company: {company}

JOB:
- Title: {jobTitle}
- Department: {department}

PERSONALIZATION HOOKS:
{hooks}

TONE: {toneGuidance}

CHARACTER LIMIT: {limit} characters (hard limit, message will be cut off if exceeded)

Write a connection request that:
1. Opens with a relevant hook (not "I saw your profile")
2. Briefly mentions interest in the role/company
3. Ends with a soft ask (open to connecting)

Return ONLY the message text, no quotes or formatting.`;

const EMAIL_PROMPT = `Write a professional outreach email for a job opportunity.

CANDIDATE:
- Name: {candidateName}
- Target Role: {targetRole}
- Key Skills: {skills}
- Background: {background}

CONTACT:
- Name: {contactName}
- Role: {contactRole}
- Company: {company}

JOB:
- Title: {jobTitle}
- Department: {department}
- Why Interested: {whyInterested}

PERSONALIZATION HOOKS:
{hooks}

TONE: {toneGuidance}

Write an email with:
1. Subject line (on first line, prefixed with "Subject: ")
2. Opening hook (not generic)
3. Brief value proposition (what you bring)
4. Soft ask (call, chat, learn more)
5. Professional sign-off

Keep body under {limit} characters.`;

/**
 * Generate outreach drafts for a contact
 */
export async function generateDrafts(
  job: NormalizedJob,
  contact: Contact,
  candidateName: string,
  candidateSkills: string[],
  hooks: PersonalizationHook[],
): Promise<DraftGenerationResult> {
  const drafts: OutreachDraft[] = [];
  const errors: string[] = [];

  // Determine platform
  const platform: OutreachPlatform = contact.linkedinUrl ? 'LINKEDIN_CONNECTION' : 'EMAIL';

  // Generate multiple variants with different tones
  const tones: OutreachTone[] = ['CONCISE', 'WARM', 'TECHNICAL'];

  for (let i = 0; i < tones.length; i++) {
    const tone = tones[i];
    const variant = String.fromCharCode(65 + i); // A, B, C

    try {
      const draft = await generateSingleDraft(
        job,
        contact,
        candidateName,
        candidateSkills,
        hooks,
        platform,
        tone,
        variant,
      );
      drafts.push(draft);
    } catch (error) {
      errors.push(`Failed to generate variant ${variant}: ${error}`);
    }
  }

  return { drafts, errors };
}

async function generateSingleDraft(
  job: NormalizedJob,
  contact: Contact,
  candidateName: string,
  candidateSkills: string[],
  hooks: PersonalizationHook[],
  platform: OutreachPlatform,
  tone: OutreachTone,
  variant: string,
): Promise<OutreachDraft> {
  const limit = PLATFORM_LIMITS[platform];
  const hooksText = hooks.map((h) => `- ${h.type}: ${h.hook}`).join('\n') || 'None provided';

  const promptTemplate =
    platform === 'LINKEDIN_CONNECTION' ? LINKEDIN_CONNECTION_PROMPT : EMAIL_PROMPT;

  const prompt = promptTemplate
    .replace('{candidateName}', candidateName)
    .replace('{targetRole}', job.title)
    .replace('{skills}', candidateSkills.slice(0, 5).join(', '))
    .replace('{background}', '')
    .replace('{contactName}', contact.name)
    .replace('{contactRole}', contact.role || 'Team Member')
    .replace('{company}', contact.company)
    .replace('{jobTitle}', job.title)
    .replace('{department}', job.department || 'Engineering')
    .replace('{whyInterested}', '')
    .replace('{hooks}', hooksText)
    .replace('{toneGuidance}', TONE_PROMPTS[tone])
    .replace(/{limit}/g, String(limit));

  const response = await complete(prompt, 'GENERAL', {
    temperature: 0.7, // Higher creativity for outreach
    maxTokens: 512,
    timeout: 60000,
  });

  // Parse email subject if present
  let subject: string | undefined;
  let body = response.trim();

  if (platform === 'EMAIL' && body.toLowerCase().startsWith('subject:')) {
    const lines = body.split('\n');
    subject = lines[0].replace(/^subject:\s*/i, '').trim();
    body = lines.slice(1).join('\n').trim();
  }

  const now = new Date().toISOString();

  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    jobId: job.id,
    contactId: contact.id,
    platform,
    variant,
    subject,
    body,
    characterCount: body.length,
    withinLimit: body.length <= limit,
    tone,
    personalizationHooks: hooks.map((h) => h.hook),
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Truncate message to fit platform limit
 */
export function truncateToLimit(message: string, limit: number): string {
  if (message.length <= limit) return message;

  // Try to truncate at sentence boundary
  const truncated = message.substring(0, limit - 3);
  const lastSentence = truncated.lastIndexOf('.');

  if (lastSentence > limit * 0.7) {
    return truncated.substring(0, lastSentence + 1);
  }

  return truncated + '...';
}
