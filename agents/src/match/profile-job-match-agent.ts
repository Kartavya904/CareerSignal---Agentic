/**
 * Profile-Job Match Agent — Compares user profile against a job posting.
 *
 * Produces a match score (0–100), letter grade, category breakdown,
 * strengths list, and gaps list. Uses LLM for semantic comparison.
 */

import { complete } from '@careersignal/llm';
import type { JobDetail } from '../browser/job-detail-extractor-agent.js';

export interface ProfileSnapshot {
  name: string;
  location: string | null;
  workAuthorization: string | null;
  seniority: string | null;
  targetRoles: string[];
  skills: string[];
  experience: { title: string; company: string; startDate?: string; endDate?: string }[];
  education: { institution: string; degree?: string; field?: string }[];
  resumeRawText: string | null;
}

export interface MatchBreakdown {
  skills: number;
  experience: number;
  location: number;
  seniority: number;
  education: number;
}

export interface MatchResult {
  overallScore: number;
  grade: string;
  breakdown: MatchBreakdown;
  strengths: string[];
  gaps: string[];
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  if (score >= 40) return 'D';
  return 'F';
}

export async function matchProfileToJob(
  profile: ProfileSnapshot,
  job: JobDetail,
): Promise<MatchResult> {
  const profileSummary = [
    `Name: ${profile.name}`,
    profile.location ? `Location: ${profile.location}` : null,
    profile.seniority ? `Seniority: ${profile.seniority}` : null,
    profile.skills.length > 0 ? `Skills: ${profile.skills.join(', ')}` : null,
    profile.targetRoles.length > 0 ? `Target roles: ${profile.targetRoles.join(', ')}` : null,
    profile.experience.length > 0
      ? `Experience:\n${profile.experience.map((e) => `  - ${e.title} at ${e.company}`).join('\n')}`
      : null,
    profile.education.length > 0
      ? `Education:\n${profile.education.map((e) => `  - ${e.degree || 'Degree'} from ${e.institution}`).join('\n')}`
      : null,
    profile.resumeRawText
      ? `Resume text (first 3000 chars):\n${profile.resumeRawText.slice(0, 3000)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const jobSummary = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    job.seniority ? `Seniority: ${job.seniority}` : null,
    job.salary ? `Salary: ${job.salary}` : null,
    job.employmentType ? `Type: ${job.employmentType}` : null,
    `Description: ${job.description.slice(0, 3000)}`,
    job.requirements.length > 0 ? `Requirements:\n${job.requirements.join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `You are a career match analyst. Compare this candidate's profile against the job posting and score the match.

CANDIDATE PROFILE:
${profileSummary}

JOB POSTING:
${jobSummary}

Return a JSON object with:
- overallScore: 0-100 integer (how well the candidate matches)
- breakdown: { skills: 0-100, experience: 0-100, location: 0-100, seniority: 0-100, education: 0-100 }
- strengths: array of 3-5 specific strengths (what makes this candidate a good fit)
- gaps: array of 3-5 specific gaps (what the candidate is missing or could improve)

Be honest and specific. A 70+ score means strong match. 50-69 is moderate. Below 50 is weak.`;

  try {
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.2,
      maxTokens: 2048,
      timeout: 120000,
    });
    const parsed = JSON.parse(response);
    const score = Math.max(0, Math.min(100, parsed.overallScore ?? 50));
    return {
      overallScore: score,
      grade: scoreToGrade(score),
      breakdown: {
        skills: parsed.breakdown?.skills ?? 50,
        experience: parsed.breakdown?.experience ?? 50,
        location: parsed.breakdown?.location ?? 50,
        seniority: parsed.breakdown?.seniority ?? 50,
        education: parsed.breakdown?.education ?? 50,
      },
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 5) : [],
    };
  } catch {
    return {
      overallScore: 0,
      grade: 'N/A',
      breakdown: { skills: 0, experience: 0, location: 0, seniority: 0, education: 0 },
      strengths: [],
      gaps: ['Unable to compute match — LLM unavailable'],
    };
  }
}
