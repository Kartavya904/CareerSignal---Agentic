/**
 * Resume Suggestions Agent — ATS-focused resume improvement suggestions.
 *
 * Given a job description and the user's resume/profile, produces:
 * - What already matches well
 * - What to add or improve
 * - Missing keywords for ATS
 */

import { complete } from '@careersignal/llm';
import type { JobDetail } from '../browser/job-detail-extractor-agent.js';
import type { ProfileSnapshot } from './profile-job-match-agent.js';

export interface ResumeSuggestions {
  matches: string[];
  improvements: string[];
  keywordsToAdd: string[];
}

export async function generateResumeSuggestions(
  profile: ProfileSnapshot,
  job: JobDetail,
): Promise<ResumeSuggestions> {
  const resumeText = profile.resumeRawText?.slice(0, 4000) || 'No resume text available.';

  const prompt = `You are an ATS (Applicant Tracking System) expert resume reviewer. Analyze this resume against the job posting.

RESUME / PROFILE:
Name: ${profile.name}
Skills: ${profile.skills.join(', ') || 'None listed'}
Experience: ${profile.experience.map((e) => `${e.title} at ${e.company}`).join('; ') || 'None listed'}
Resume text:
${resumeText}

JOB POSTING:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description.slice(0, 3000)}
Requirements: ${job.requirements.join(', ') || 'None listed'}

Return a JSON object with:
- matches: array of 3-6 bullet strings — what in the resume already aligns well with this job (be specific, reference actual skills/experience)
- improvements: array of 3-6 bullet strings — what to add or rephrase in the resume to better match this job (actionable suggestions)
- keywordsToAdd: array of 5-10 keywords/phrases from the job posting that are missing from the resume (for ATS optimization)

Be specific and actionable. Reference actual terms from both the resume and job posting.`;

  try {
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.2,
      maxTokens: 2048,
      timeout: 180000, // 3 min minimum for application assistant
    });
    const parsed = JSON.parse(response);
    return {
      matches: Array.isArray(parsed.matches) ? parsed.matches.slice(0, 6) : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 6) : [],
      keywordsToAdd: Array.isArray(parsed.keywordsToAdd) ? parsed.keywordsToAdd.slice(0, 10) : [],
    };
  } catch {
    return {
      matches: [],
      improvements: ['Unable to generate suggestions — LLM unavailable'],
      keywordsToAdd: [],
    };
  }
}
