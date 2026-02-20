/**
 * Preference Builder Agent - Auto-populates preferences from profile
 *
 * Responsibilities:
 * - Map extracted resume fields to preference fields
 * - Suggest preferences based on work history
 * - Calculate strictness recommendations
 *
 * LLM Usage: Light (suggest preferences from resume context)
 */

import { complete } from '@careersignal/llm';
import type { UserPreferences } from '../rank/types.js';

export interface ProfileData {
  name: string;
  location?: string;
  workAuthorization?: string;
  skills: string[];
  experience: {
    title: string;
    company: string;
    startDate?: string;
    endDate?: string;
  }[];
  education: {
    institution: string;
    degree?: string;
    field?: string;
  }[];
  targetRoles?: string[];
}

export interface PreferenceBuilderResult {
  preferences: Partial<UserPreferences>;
  suggestions: string[];
  confidence: number;
}

/**
 * Build preferences from profile data
 */
export async function buildPreferencesFromProfile(
  profile: ProfileData,
): Promise<PreferenceBuilderResult> {
  const suggestions: string[] = [];
  let confidence = 0.5;

  // Map work authorization
  const workAuth = mapWorkAuthorization(profile.workAuthorization);
  if (workAuth) confidence += 0.1;

  // Extract target locations from current location
  const targetLocations: string[] = [];
  if (profile.location) {
    targetLocations.push(profile.location);
    suggestions.push(
      `Added "${profile.location}" as target location based on your current location`,
    );
  }

  // Infer target roles from experience
  const targetRoles = inferTargetRoles(profile.experience);
  if (targetRoles.length > 0) {
    suggestions.push(`Suggested ${targetRoles.length} target roles based on your experience`);
    confidence += 0.1;
  }

  // Infer seniority from experience
  const targetSeniority = inferSeniority(profile.experience);
  if (targetSeniority.length > 0) {
    suggestions.push(`Suggested seniority level: ${targetSeniority.join(', ')}`);
    confidence += 0.1;
  }

  // Extract skills
  const skills = profile.skills.slice(0, 20);
  if (skills.length > 0) {
    suggestions.push(`Extracted ${skills.length} skills from your profile`);
    confidence += 0.1;
  }

  const preferences: Partial<UserPreferences> = {
    workAuthorization: workAuth || 'OTHER',
    targetLocations,
    targetRoles: targetRoles.length > 0 ? targetRoles : profile.targetRoles,
    targetSeniority,
    skills,
    remotePreference: 'ANY',
    strictMode: workAuth === 'H1B' || workAuth === 'OPT', // Strict mode if needs sponsorship
  };

  return {
    preferences,
    suggestions,
    confidence: Math.min(1, confidence),
  };
}

function mapWorkAuthorization(auth?: string): UserPreferences['workAuthorization'] | undefined {
  if (!auth) return undefined;

  const authLower = auth.toLowerCase();

  if (authLower.includes('citizen') || authLower.includes('us citizen')) {
    return 'US_CITIZEN';
  }
  if (authLower.includes('green card') || authLower.includes('permanent resident')) {
    return 'GREEN_CARD';
  }
  if (authLower.includes('h1b') || authLower.includes('h-1b')) {
    return 'H1B';
  }
  if (authLower.includes('opt') || authLower.includes('f-1')) {
    return 'OPT';
  }
  if (authLower.includes('ead')) {
    return 'EAD';
  }

  return 'OTHER';
}

function inferTargetRoles(experience: ProfileData['experience']): string[] {
  const roles = new Set<string>();

  for (const exp of experience) {
    const title = exp.title.toLowerCase();

    // Map titles to standard role categories
    if (title.includes('software') || title.includes('developer') || title.includes('engineer')) {
      if (title.includes('full stack') || title.includes('fullstack')) {
        roles.add('Full Stack Engineer');
      } else if (
        title.includes('frontend') ||
        title.includes('front-end') ||
        title.includes('ui')
      ) {
        roles.add('Frontend Engineer');
      } else if (title.includes('backend') || title.includes('back-end')) {
        roles.add('Backend Engineer');
      } else {
        roles.add('Software Engineer');
      }
    }

    if (title.includes('data') && title.includes('engineer')) {
      roles.add('Data Engineer');
    }

    if (title.includes('machine learning') || title.includes('ml engineer')) {
      roles.add('Machine Learning Engineer');
    }

    if (title.includes('data scientist')) {
      roles.add('Data Scientist');
    }

    if (title.includes('devops') || title.includes('sre') || title.includes('reliability')) {
      roles.add('DevOps Engineer');
    }
  }

  return Array.from(roles);
}

function inferSeniority(experience: ProfileData['experience']): string[] {
  // Calculate years of experience
  let totalMonths = 0;

  for (const exp of experience) {
    if (exp.startDate) {
      const start = new Date(exp.startDate);
      const end = exp.endDate ? new Date(exp.endDate) : new Date();
      const months = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
      totalMonths += months;
    }
  }

  const years = totalMonths / 12;

  if (years < 1) {
    return ['INTERN', 'JUNIOR'];
  } else if (years < 3) {
    return ['JUNIOR', 'MID'];
  } else if (years < 6) {
    return ['MID', 'SENIOR'];
  } else if (years < 10) {
    return ['SENIOR', 'STAFF'];
  } else {
    return ['STAFF', 'PRINCIPAL'];
  }
}

/**
 * Use LLM to suggest additional preferences
 */
export async function suggestAdditionalPreferences(profile: ProfileData): Promise<string[]> {
  const prompt = `Based on this candidate's profile, suggest additional job search preferences.

Profile:
- Location: ${profile.location || 'Not specified'}
- Skills: ${profile.skills.slice(0, 10).join(', ')}
- Recent Experience: ${profile.experience
    .slice(0, 2)
    .map((e) => e.title)
    .join(', ')}
- Education: ${profile.education
    .slice(0, 1)
    .map((e) => `${e.degree || ''} in ${e.field || ''} from ${e.institution}`)
    .join(', ')}

Suggest:
1. Industries that might be a good fit
2. Company size preferences (startup, mid-size, enterprise)
3. Any other relevant preferences

Return JSON array of suggestion strings.`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.5,
      maxTokens: 512,
      timeout: 30000,
    });

    const parsed = JSON.parse(response);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
