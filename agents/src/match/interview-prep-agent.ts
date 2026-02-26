/**
 * Interview Prep Agent — Generates 3-5 STAR-format talking points
 * based on the job description and the candidate's profile.
 */

import { complete } from '@careersignal/llm';
import type { JobDetail } from '../browser/job-detail-extractor-agent.js';
import type { ProfileSnapshot } from './profile-job-match-agent.js';

export async function generateInterviewPrep(
  profile: ProfileSnapshot,
  job: JobDetail,
  options?: { companyResearch?: string },
): Promise<string[]> {
  const companyBlock = options?.companyResearch
    ? `\nCompany culture/norms (use to tailor answers): ${options.companyResearch}\n`
    : '';

  const prompt = `You are an interview coach. Based on this job and candidate, generate 3-5 STAR-format talking points the candidate can use in an interview.
${companyBlock}
JOB: ${job.title} at ${job.company}
Description: ${job.description.slice(0, 2000)}
Requirements: ${job.requirements.join(', ') || 'Not specified'}

CANDIDATE:
Skills: ${profile.skills.join(', ') || 'None'}
Experience: ${profile.experience.map((e) => `${e.title} at ${e.company}`).join('; ') || 'None'}

Each bullet should suggest a specific scenario from the candidate's likely experience that demonstrates a skill the job requires. Format: "When asked about [topic], discuss [specific scenario]: [brief STAR outline]."

Return a JSON array of 3-5 strings.`;

  try {
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.3,
      maxTokens: 1024,
      timeout: 90000,
    });
    const parsed = JSON.parse(response);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}
