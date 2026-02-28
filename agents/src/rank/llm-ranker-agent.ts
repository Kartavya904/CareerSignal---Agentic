/**
 * LLM Ranker Agent - Deep preference reasoning via Ollama
 *
 * Responsibilities:
 * - Full profile-to-job reasoning
 * - Consider nuance that rules can't capture
 * - Generate natural language explanations
 *
 * LLM Usage: Heavy (core function is LLM reasoning)
 */

import { complete } from '@careersignal/llm';
import type { NormalizedJob } from '../normalize/types.js';
import type { UserPreferences, ScoreBreakdown } from './types.js';

export interface LLMRankingResult {
  score: number;
  explanation: string;
  evidence: string[];
  flags: string[];
}

const RANKING_PROMPT = `You are an expert job matching system. Analyze how well this job matches the candidate's profile.

CANDIDATE PROFILE:
- Work Authorization: {workAuth}
- Target Locations: {locations}
- Remote Preference: {remote}
- Target Seniority: {seniority}
- Target Roles: {roles}
- Key Skills: {skills}
- Industries: {industries}

JOB DETAILS:
- Title: {jobTitle}
- Company: {company}
- Location: {jobLocation}
- Remote Type: {jobRemote}
- Seniority Level: {jobSeniority}
- Visa Sponsorship: {visa}

JOB DESCRIPTION:
{description}

Analyze the match and provide:
1. score: Overall match score 0-100 (be precise, use decimals like 87.5)
2. explanation: 2-3 sentence explanation of fit/gaps
3. evidence: Array of specific quotes from job that support your scoring
4. flags: Array of concerns or mismatches (empty if none)

Consider:
- Does the job level match candidate experience?
- Are required skills present in candidate profile?
- Is visa sponsorship available if needed?
- Does location/remote policy work?
- Any red flags in the description?

Return JSON: { score, explanation, evidence, flags }`;

/**
 * Score a job using LLM reasoning
 */
export async function scoreJobWithLLM(
  job: NormalizedJob,
  preferences: UserPreferences,
): Promise<LLMRankingResult> {
  const prompt = RANKING_PROMPT.replace('{workAuth}', preferences.workAuthorization)
    .replace('{locations}', preferences.targetLocations.join(', ') || 'Any')
    .replace('{remote}', preferences.remotePreference)
    .replace('{seniority}', preferences.targetSeniority.join(', ') || 'Any')
    .replace('{roles}', preferences.targetRoles.join(', ') || 'Any')
    .replace('{skills}', preferences.skills.slice(0, 15).join(', ') || 'Not specified')
    .replace('{industries}', preferences.industries.join(', ') || 'Any')
    .replace('{jobTitle}', job.title)
    .replace('{company}', job.companyName)
    .replace('{jobLocation}', job.location || 'Not specified')
    .replace('{jobRemote}', job.remoteType)
    .replace('{jobSeniority}', job.seniority)
    .replace('{visa}', job.visaSponsorship)
    .replace('{description}', (job.description || '').substring(0, 2000));

  try {
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.2,
      maxTokens: 1024,
      timeout: 180000, // 3 min minimum for application assistant
    });

    const parsed = JSON.parse(response);

    return {
      score: typeof parsed.score === 'number' ? parsed.score : 50,
      explanation: parsed.explanation || '',
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    };
  } catch (error) {
    console.error('[LLMRanker] Scoring failed:', error);
    return {
      score: 50,
      explanation: 'Unable to analyze job match',
      evidence: [],
      flags: ['LLM analysis failed'],
    };
  }
}

/**
 * Batch score multiple jobs (more efficient than one at a time)
 */
export async function batchScoreJobs(
  jobs: NormalizedJob[],
  preferences: UserPreferences,
): Promise<Map<string, LLMRankingResult>> {
  const results = new Map<string, LLMRankingResult>();

  // Process sequentially to avoid overwhelming the LLM
  for (const job of jobs) {
    const result = await scoreJobWithLLM(job, preferences);
    results.set(job.id, result);
  }

  return results;
}

/**
 * Combine rule and LLM scores
 */
export function combineScores(
  ruleScore: number,
  llmScore: number,
  ruleWeight: number = 0.4,
  llmWeight: number = 0.6,
): number {
  return Math.round((ruleScore * ruleWeight + llmScore * llmWeight) * 100) / 100;
}
