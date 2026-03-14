/**
 * Cover Letter Agent — Generates a single cover letter (or legacy 3 variants) for a job application.
 *
 * When style preferences and/or userInstruction are provided, generates one letter tailored to them.
 * Otherwise can generate 3 style variants (formal, conversational, bold) for backward compatibility.
 */

import { complete } from '@careersignal/llm';
import type { JobDetail } from '../browser/job-detail-extractor-agent.js';
import type { ProfileSnapshot } from '../match/profile-job-match-agent.js';

export interface CoverLetters {
  formal: string;
  conversational: string;
  bold: string;
}

export interface CoverLetterStylePrefs {
  tone?: string[];
  length?: 'CONCISE' | 'DEFAULT' | 'DETAILED';
  wordChoice?: string[];
  notes?: string | null;
}

export interface GenerateSingleCoverLetterOptions {
  companyResearch?: string;
  style?: CoverLetterStylePrefs;
  /** User's free-form instruction for regeneration (e.g. "make it shorter and more direct") */
  userInstruction?: string | null;
}

function buildProfileCtx(profile: ProfileSnapshot): string {
  return [
    `Name: ${profile.name}`,
    profile.location ? `Location: ${profile.location}` : null,
    profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : null,
    profile.githubUrl ? `GitHub: ${profile.githubUrl}` : null,
    profile.portfolioUrl ? `Portfolio: ${profile.portfolioUrl}` : null,
    profile.skills.length > 0 ? `Key skills: ${profile.skills.slice(0, 15).join(', ')}` : null,
    profile.experience.length > 0
      ? `Recent roles: ${profile.experience
          .slice(0, 3)
          .map((e) => `${e.title} at ${e.company}`)
          .join('; ')}`
      : null,
    profile.education.length > 0
      ? `Education: ${profile.education
          .slice(0, 2)
          .map((e) => `${e.degree || ''} from ${e.institution}`)
          .join('; ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildJobCtx(job: JobDetail, companyResearch?: string): string {
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.companyOneLiner ? `About company: ${job.companyOneLiner}` : null,
    companyResearch ? `Company research (culture, norms): ${companyResearch}` : null,
    job.location ? `Location: ${job.location}` : null,
    `Description: ${job.description.slice(0, 2000)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Generate a single cover letter using optional style preferences and/or user instruction.
 * Returns a Record with one key "draft" for storage in analysis.coverLetters.
 */
export async function generateSingleCoverLetter(
  profile: ProfileSnapshot,
  job: JobDetail,
  options?: GenerateSingleCoverLetterOptions,
): Promise<Record<string, string>> {
  const profileCtx = buildProfileCtx(profile);
  const jobCtx = buildJobCtx(job, options?.companyResearch);

  const style = options?.style;
  const lengthGuidance =
    style?.length === 'CONCISE'
      ? 'Keep it concise: roughly 150–200 words.'
      : style?.length === 'DETAILED'
        ? 'Use a detailed length: roughly 300–400 words.'
        : 'Use a medium length: roughly 200–300 words.';

  const toneList = style?.tone?.length
    ? style.tone.join(', ')
    : 'Professional, clear, and tailored to the role.';
  const wordChoiceList = style?.wordChoice?.length
    ? `Word choice: ${style.wordChoice.join(', ')}.`
    : '';
  const structureNote = style?.notes?.trim()
    ? `\n\nIMPORTANT - Structure and closing from the candidate:\n${style.notes}\nApply this opening, structure, and signature in the letter.`
    : '';
  const userInstructionLine = options?.userInstruction?.trim()
    ? `\n\nADDITIONAL INSTRUCTION FROM THE CANDIDATE (follow this):\n${options.userInstruction}`
    : '';

  const prompt = `Write one cover letter for this job application.

CANDIDATE:
${profileCtx}

JOB:
${jobCtx}
${structureNote}${userInstructionLine}

STYLE:
- Tone: ${toneList}
${lengthGuidance}
${wordChoiceList}

The letter should:
- Reference specific skills and experience from the candidate's profile
- Mention the company and role by name
- Highlight why the candidate is a good fit
- End with a clear call to action

IMPORTANT:
- If LinkedIn/GitHub/Portfolio URLs are provided in the candidate profile, you may include them in the signature/contact line.
- If they are NOT provided, do NOT invent them and do NOT write placeholders like \"Link to portfolio/GitHub\".

Return ONLY the raw cover letter text (no JSON, no key). Start directly with the greeting (e.g. Dear Hiring Manager).`;

  try {
    const response = await complete(prompt, 'GENERAL', {
      temperature: 0.6,
      maxTokens: 2048,
      timeout: 180000, // 3 min for application assistant single cover letter
    });
    const draft = (response?.trim() ||
      'Cover letter generation failed. Please try again.') as string;
    return { draft };
  } catch {
    return { draft: 'Cover letter generation failed. Please try again.' };
  }
}

export async function generateCoverLetters(
  profile: ProfileSnapshot,
  job: JobDetail,
  options?: { companyResearch?: string },
): Promise<CoverLetters> {
  const profileCtx = buildProfileCtx(profile);
  const jobCtx = buildJobCtx(job, options?.companyResearch);

  const prompt = `Write 3 cover letters (each 200-300 words) for this job application in different tones.

CANDIDATE:
${profileCtx}

JOB:
${jobCtx}

Return JSON with 3 keys:
- "formal": Professional, traditional tone. Opens with "Dear Hiring Manager." Structured paragraphs. Emphasizes qualifications and alignment.
- "conversational": Friendly but professional. Opens with a warm hook. Shows personality while remaining respectful. Uses "I" and direct language.
- "bold": Confident and attention-grabbing. Opens with a strong statement or question. Takes a stand on value delivered. Memorable and concise.

Each letter should:
- Reference specific skills and experience from the candidate's profile
- Mention the company and role by name
- Highlight why the candidate is a good fit
- End with a clear call to action

Return ONLY the JSON object with the 3 letter strings.`;

  try {
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.6,
      maxTokens: 4096,
      timeout: 180000,
    });
    const parsed = JSON.parse(response);
    return {
      formal: parsed.formal || 'Unable to generate formal cover letter.',
      conversational: parsed.conversational || 'Unable to generate conversational cover letter.',
      bold: parsed.bold || 'Unable to generate bold cover letter.',
    };
  } catch {
    return {
      formal: 'Cover letter generation failed. Please try again.',
      conversational: 'Cover letter generation failed. Please try again.',
      bold: 'Cover letter generation failed. Please try again.',
    };
  }
}
