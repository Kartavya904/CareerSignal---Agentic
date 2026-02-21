/**
 * Profile Insights Agent – computes years (work only), seniority, and LLM-based scores (0–100).
 * Uses the 32B GENERAL model and the full resume + profile context.
 */

import { complete, parseJsonResponse } from '@careersignal/llm';
import { z } from 'zod';

const InsightsSchema = z.object({
  keywordDepth: z.number().min(0).max(100),
  strengthScore: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  resumeRating: z.string(),
});

export interface ProfileForInsights {
  experience: unknown[];
  skills: string[];
  resumeRawText: string | null;
}

export interface ProfileInsightsResult {
  totalYearsExperience: number;
  totalMonthsExperience: number;
  seniority: string;
  keywordDepth: number;
  strengthScore: number;
  overallScore: number;
  resumeRating: string;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function parseYearFromDate(dateStr: string | null | undefined): number | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const four = dateStr.match(/\b(19|20)\d{2}\b/);
  if (four) return parseInt(four[0], 10);
  const two = dateStr.match(/\b(\d{2})\b/);
  if (two) {
    const y = parseInt(two[1], 10);
    return y >= 0 && y <= 50 ? 2000 + y : 1900 + y;
  }
  return null;
}

/** Parse 1-12 from strings like "Jan 2020", "2020-01", "01/2020". */
function parseMonthFromDate(dateStr: string | null | undefined): number {
  if (!dateStr || typeof dateStr !== 'string') return 1;
  const s = dateStr.toLowerCase().trim();
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    if (s.includes(name)) return num;
  }
  const slashOrDash = s.match(/(\d{1,2})[\/\-](\d{1,4})/);
  if (slashOrDash) return Math.max(1, Math.min(12, parseInt(slashOrDash[1], 10)));
  const iso = s.match(/(\d{4})[\-](\d{2})/);
  if (iso) return Math.max(1, Math.min(12, parseInt(iso[2], 10)));
  return 1;
}

function getDateStr(exp: Record<string, unknown>, start: boolean): string | null {
  const raw = start ? (exp.start_date ?? exp.startDate) : (exp.end_date ?? exp.endDate);
  return typeof raw === 'string' ? raw : null;
}

/** Total months from work experience only (not projects). Uses month-aware duration. */
export function estimateTotalMonthsFromWork(experience: unknown[]): number {
  if (!experience?.length) return 0;
  const entries = experience as Array<Record<string, unknown>>;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let totalMonths = 0;
  for (const exp of entries) {
    const startDateStr = getDateStr(exp, true);
    const endDateStr = getDateStr(exp, false);
    const startYear = parseYearFromDate(startDateStr);
    let endYear = parseYearFromDate(endDateStr);
    const endStr = (endDateStr || '').toLowerCase();
    const isPresent = endStr.includes('present') || endStr.includes('current');
    if (!endYear && isPresent) endYear = currentYear;

    if (startYear == null || endYear == null || endYear < startYear) continue;

    const startMonth = parseMonthFromDate(startDateStr);
    const endMonth =
      isPresent && endYear === currentYear
        ? currentMonth
        : endYear === currentYear
          ? currentMonth
          : parseMonthFromDate(endDateStr) || 12;

    const startTotalMonths = startYear * 12 + (startMonth - 1);
    const endTotalMonths = endYear * 12 + (endMonth - 1);
    const durationMonths = Math.max(0, endTotalMonths - startTotalMonths + 1);
    totalMonths += durationMonths;
  }

  totalMonths = Math.min(40 * 12, Math.max(0, totalMonths));
  if (totalMonths === 0 && entries.length > 0) {
    totalMonths = Math.min(40 * 12, entries.length * 12);
  }
  return totalMonths;
}

/** Total years from work experience only (rounded from months). */
export function estimateTotalYearsFromWork(experience: unknown[]): number {
  const months = estimateTotalMonthsFromWork(experience);
  return Math.round(months / 12);
}

/** Under 2 years = Entry; 2–2.99 = Junior; 3–7 = Mid; 8+ = Senior. Title overrides for Senior+/Senior only. */
export function inferSeniority(totalYears: number, experience: unknown[]): string {
  if (totalYears < 2) return 'Entry';
  const titles = (experience as Array<Record<string, unknown>>)
    .map((e) => String(e.title ?? '').toLowerCase())
    .join(' ');
  if (
    totalYears >= 15 ||
    titles.includes('director') ||
    titles.includes('vp') ||
    titles.includes('principal')
  )
    return 'Senior+';
  if (totalYears >= 8 || titles.includes('senior') || titles.includes('staff')) return 'Senior';
  if (totalYears >= 3 || titles.includes('mid') || titles.includes('engineer')) return 'Mid';
  if (totalYears >= 2 || titles.includes('junior')) return 'Junior';
  return 'Entry';
}

/** Max chars of resume to send to the 32B model (fits in context with prompt). */
const MAX_RESUME_CHARS = 24_000;

/**
 * Compute profile insights: years (work only), seniority, and LLM scores (0–100).
 * Uses GENERAL (32B) model and the full resume text (up to MAX_RESUME_CHARS) for better quality.
 * When resumeRawText is missing, returns 0 for scores and a placeholder resumeRating.
 */
export async function computeProfileInsights(
  profile: ProfileForInsights,
): Promise<ProfileInsightsResult> {
  const experience = profile.experience ?? [];
  const skills = profile.skills ?? [];
  const totalMonths = estimateTotalMonthsFromWork(experience);
  const totalYears = Math.round(totalMonths / 12);
  const seniority = inferSeniority(totalYears, experience);

  if (!profile.resumeRawText?.trim()) {
    return {
      totalYearsExperience: totalYears,
      totalMonthsExperience: totalMonths,
      seniority,
      keywordDepth: 0,
      strengthScore: 0,
      overallScore: 0,
      resumeRating: 'Parse your resume to see keyword depth, strength score, and overall rating.',
    };
  }

  const fullResume =
    profile.resumeRawText.length <= MAX_RESUME_CHARS
      ? profile.resumeRawText
      : profile.resumeRawText.slice(0, MAX_RESUME_CHARS) +
        '\n\n[... resume truncated for length ...]';

  const prompt = `You are an expert resume reviewer for tech and professional roles. Evaluate this candidate's resume using the FULL resume text and profile summary below.

--- FULL RESUME TEXT ---
${fullResume}
--- END RESUME ---

PROFILE SUMMARY (work experience only for years):
- Total years experience: ${totalYears}
- Number of roles: ${experience.length}
- Inferred seniority: ${seniority}
- Skills (${skills.length}): ${skills.slice(0, 50).join(', ')}${skills.length > 50 ? '...' : ''}

Provide a concise evaluation. Return JSON only. All three scores must be integers from 0 to 100.
{
  "keywordDepth": <0-100, how well keywords and skills are represented and aligned with typical job postings>,
  "strengthScore": <0-100, overall strength of experience and impact>,
  "overallScore": <0-100, holistic resume quality for the target roles>,
  "resumeRating": "<2-3 sentence paragraph: how would you rate this resume? Be specific and constructive.>"
}`;

  const response = await complete(prompt, 'GENERAL', {
    format: 'json',
    temperature: 0.3,
    timeout: 120000,
  });

  const result = parseJsonResponse(response, InsightsSchema);
  if (!result.success || !result.data) {
    console.error('Profile insights parse error:', result.error);
    return {
      totalYearsExperience: totalYears,
      totalMonthsExperience: totalMonths,
      seniority,
      keywordDepth: 0,
      strengthScore: 0,
      overallScore: 0,
      resumeRating: 'Unable to generate rating. Please try again.',
    };
  }

  return {
    totalYearsExperience: totalYears,
    totalMonthsExperience: totalMonths,
    seniority,
    keywordDepth: result.data.keywordDepth,
    strengthScore: result.data.strengthScore,
    overallScore: result.data.overallScore,
    resumeRating: result.data.resumeRating,
  };
}
