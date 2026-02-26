/**
 * Cover Letter Agent — Generates 3 style variants for a job application.
 *
 * Styles: Formal, Conversational, Bold.
 * Each ~200-300 words, personalized to the job and user profile.
 */

import { complete } from '@careersignal/llm';
import type { JobDetail } from '../browser/job-detail-extractor-agent.js';
import type { ProfileSnapshot } from '../match/profile-job-match-agent.js';

export interface CoverLetters {
  formal: string;
  conversational: string;
  bold: string;
}

export async function generateCoverLetters(
  profile: ProfileSnapshot,
  job: JobDetail,
  options?: { companyResearch?: string },
): Promise<CoverLetters> {
  const profileCtx = [
    `Name: ${profile.name}`,
    profile.location ? `Location: ${profile.location}` : null,
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

  const jobCtx = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.companyOneLiner ? `About company: ${job.companyOneLiner}` : null,
    options?.companyResearch
      ? `Company research (culture, norms): ${options.companyResearch}`
      : null,
    job.location ? `Location: ${job.location}` : null,
    `Description: ${job.description.slice(0, 2000)}`,
  ]
    .filter(Boolean)
    .join('\n');

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
