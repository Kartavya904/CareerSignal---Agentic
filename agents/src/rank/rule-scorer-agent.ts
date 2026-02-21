/**
 * Rule Scorer Agent - Deterministic rule-based job scoring
 *
 * Responsibilities:
 * - Binary checks: visa match, location match, seniority match
 * - Dimension scores: skills overlap, experience fit
 * - Fast, transparent, reproducible scoring
 *
 * LLM Usage: None (pure code logic)
 */

import type { NormalizedJob } from '../normalize/types.js';
import type { ScoreBreakdown, UserPreferences, DimensionMatch } from './types.js';

export interface RuleScoringResult {
  score: number;
  breakdown: ScoreBreakdown;
  passesStrictFilter: boolean;
}

/**
 * Score a job using rule-based scoring
 */
export function scoreJobWithRules(
  job: NormalizedJob,
  preferences: UserPreferences,
): RuleScoringResult {
  // Calculate dimension scores
  const visaMatch = checkVisaMatch(job, preferences);
  const locationMatch = checkLocationMatch(job, preferences);
  const seniorityMatch = checkSeniorityMatch(job, preferences);
  const remoteMatch = checkRemoteMatch(job, preferences);
  const employmentTypeMatch = checkEmploymentTypeMatch(job, preferences);
  const skillsOverlap = calculateSkillsOverlap(job, preferences);
  const experienceFit = 0.5; // Placeholder - would need experience data
  const industryMatch: DimensionMatch = 'UNKNOWN'; // Placeholder

  // Calculate weighted score
  let score = 0;
  const weights = {
    visa: 25,
    location: 20,
    seniority: 15,
    remote: 10,
    employment: 5,
    skills: 20,
    experience: 5,
  };

  score += matchToScore(visaMatch) * weights.visa;
  score += matchToScore(locationMatch) * weights.location;
  score += matchToScore(seniorityMatch) * weights.seniority;
  score += matchToScore(remoteMatch) * weights.remote;
  score += matchToScore(employmentTypeMatch) * weights.employment;
  score += skillsOverlap * weights.skills;
  score += experienceFit * weights.experience;

  // Check strict filter (strictFilterLevel; fallback to strictMode for backward compat)
  const level = preferences.strictFilterLevel ?? (preferences.strictMode ? 'STRICT' : 'OFF');
  const passesStrictFilter = checkStrictFilter(visaMatch, locationMatch, seniorityMatch, level);

  const breakdown: ScoreBreakdown = {
    ruleScore: Math.round(score * 100) / 100,
    finalScore: Math.round(score * 100) / 100,
    dimensions: {
      visaMatch,
      locationMatch,
      seniorityMatch,
      skillsOverlap,
      experienceFit,
      industryMatch,
      employmentTypeMatch,
      remoteMatch,
    },
    evidence: [],
  };

  return {
    score: breakdown.ruleScore,
    breakdown,
    passesStrictFilter,
  };
}

function matchToScore(match: DimensionMatch): number {
  switch (match) {
    case 'MATCH':
      return 1;
    case 'PARTIAL':
      return 0.5;
    case 'MISMATCH':
      return 0;
    case 'UNKNOWN':
      return 0.3; // Slight penalty for unknown
  }
}

function checkVisaMatch(job: NormalizedJob, prefs: UserPreferences): DimensionMatch {
  // If user needs sponsorship and job doesn't offer it, mismatch
  if (prefs.workAuthorization === 'H1B' || prefs.workAuthorization === 'OPT') {
    if (job.visaSponsorship === 'NO') return 'MISMATCH';
    if (job.visaSponsorship === 'YES') return 'MATCH';
    return 'UNKNOWN';
  }
  // US citizens/green card holders don't need sponsorship
  return 'MATCH';
}

function checkLocationMatch(job: NormalizedJob, prefs: UserPreferences): DimensionMatch {
  if (!prefs.targetLocations?.length) return 'MATCH'; // No preference = any location
  if (!job.location) return 'UNKNOWN';

  const jobLocationLower = job.location.toLowerCase();

  for (const targetLoc of prefs.targetLocations) {
    // Structured: { country, state?, city? }
    const country =
      typeof targetLoc === 'string'
        ? targetLoc
        : (targetLoc as { country: string; state?: string; city?: string }).country;
    const state =
      typeof targetLoc === 'object' && targetLoc !== null && 'state' in targetLoc
        ? (targetLoc as { state?: string }).state
        : undefined;
    const city =
      typeof targetLoc === 'object' && targetLoc !== null && 'city' in targetLoc
        ? (targetLoc as { city?: string }).city
        : undefined;

    if (jobLocationLower.includes(country.toLowerCase())) {
      if (state && !jobLocationLower.includes(state.toLowerCase())) continue;
      if (city && !jobLocationLower.includes(city.toLowerCase())) continue;
      return 'MATCH';
    }
  }

  // Check if remote (location doesn't matter)
  if (job.remoteType === 'REMOTE' && prefs.remotePreference !== 'ONSITE') {
    return 'MATCH';
  }

  return 'MISMATCH';
}

function checkSeniorityMatch(job: NormalizedJob, prefs: UserPreferences): DimensionMatch {
  if (!prefs.targetSeniority.length) return 'MATCH'; // No preference
  if (job.seniority === 'UNKNOWN') return 'UNKNOWN';

  if (prefs.targetSeniority.includes(job.seniority)) {
    return 'MATCH';
  }

  // Adjacent seniority levels are partial match (include ENTRY per plan)
  const levels = [
    'INTERN',
    'ENTRY',
    'JUNIOR',
    'MID',
    'SENIOR',
    'STAFF',
    'PRINCIPAL',
    'DIRECTOR',
    'VP',
    'C_LEVEL',
  ];
  const jobIdx = levels.indexOf(job.seniority);

  for (const targetSeniority of prefs.targetSeniority) {
    const targetIdx = levels.indexOf(targetSeniority);
    if (Math.abs(jobIdx - targetIdx) === 1) {
      return 'PARTIAL';
    }
  }

  return 'MISMATCH';
}

function checkRemoteMatch(job: NormalizedJob, prefs: UserPreferences): DimensionMatch {
  if (prefs.remotePreference === 'ANY') return 'MATCH';
  if (job.remoteType === 'UNKNOWN') return 'UNKNOWN';
  if (job.remoteType === prefs.remotePreference) return 'MATCH';

  // Hybrid is partial match for both remote and onsite preferences
  if (job.remoteType === 'HYBRID') return 'PARTIAL';

  return 'MISMATCH';
}

function checkEmploymentTypeMatch(job: NormalizedJob, prefs: UserPreferences): DimensionMatch {
  if (!prefs.employmentTypes.length) return 'MATCH';
  if (job.employmentType === 'UNKNOWN') return 'UNKNOWN';

  if (prefs.employmentTypes.includes(job.employmentType)) {
    return 'MATCH';
  }

  return 'MISMATCH';
}

function calculateSkillsOverlap(job: NormalizedJob, prefs: UserPreferences): number {
  if (!prefs.skills.length) return 0.5; // No skills listed = neutral
  if (!job.description) return 0.3;

  const jobText = job.description.toLowerCase();
  let matchCount = 0;

  for (const skill of prefs.skills) {
    if (jobText.includes(skill.toLowerCase())) {
      matchCount++;
    }
  }

  return prefs.skills.length > 0 ? matchCount / prefs.skills.length : 0.5;
}

type StrictFilterLevel = 'STRICT' | 'SEMI_STRICT' | 'OFF';

function checkStrictFilter(
  visa: DimensionMatch,
  location: DimensionMatch,
  seniority: DimensionMatch,
  level: StrictFilterLevel,
): boolean {
  if (level === 'OFF') return true;

  const visaFail = visa === 'MISMATCH';
  const locationFail = location === 'MISMATCH';
  const seniorityFail = seniority === 'MISMATCH';
  const failCount = (visaFail ? 1 : 0) + (locationFail ? 1 : 0) + (seniorityFail ? 1 : 0);

  if (level === 'STRICT') {
    return failCount === 0;
  }
  // SEMI_STRICT: exclude only when two or more fail
  return failCount < 2;
}
