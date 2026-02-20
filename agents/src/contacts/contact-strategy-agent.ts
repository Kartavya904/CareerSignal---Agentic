/**
 * Contact Strategy Agent - Decides which contact archetype to find
 *
 * Responsibilities:
 * - Analyze job and company to determine best contact type
 * - Generate search queries
 * - Prioritize contact archetypes
 *
 * LLM Usage: Medium (strategy decisions based on job context)
 */

import { complete } from '@careersignal/llm';
import type { NormalizedJob } from '../normalize/types.js';
import type { ContactStrategy, ContactArchetype } from './types.js';

// Contact priority by job type
const CONTACT_PRIORITIES: Record<string, ContactArchetype[]> = {
  engineering: ['HIRING_MANAGER', 'ENG_MANAGER', 'TEAM_LEAD', 'TECH_RECRUITER'],
  internship: ['CAMPUS_RECRUITER', 'TECH_RECRUITER', 'HIRING_MANAGER'],
  startup: ['FOUNDER', 'HIRING_MANAGER', 'ENG_MANAGER'],
  default: ['HIRING_MANAGER', 'TECH_RECRUITER', 'ENG_MANAGER', 'TEAM_LEAD'],
};

/**
 * Determine contact strategy for a job
 */
export async function determineContactStrategy(
  job: NormalizedJob,
  companySize?: 'startup' | 'small' | 'medium' | 'large' | 'unknown',
): Promise<ContactStrategy> {
  // Determine job type
  const jobType = classifyJobType(job);

  // Get priority list
  let archetypes = CONTACT_PRIORITIES[jobType] || CONTACT_PRIORITIES.default;

  // Adjust for company size
  if (companySize === 'startup') {
    archetypes = ['FOUNDER', ...archetypes.filter((a) => a !== 'FOUNDER')];
  }

  // Generate search queries
  const queries = generateSearchQueries(job, archetypes);

  return {
    targetArchetypes: archetypes,
    searchQueries: queries,
    reasoning: `Job type: ${jobType}, Company size: ${companySize || 'unknown'}`,
  };
}

function classifyJobType(job: NormalizedJob): string {
  const titleLower = job.title.toLowerCase();

  if (job.seniority === 'INTERN') return 'internship';
  if (titleLower.includes('engineer') || titleLower.includes('developer')) return 'engineering';

  return 'default';
}

function generateSearchQueries(job: NormalizedJob, archetypes: ContactArchetype[]): string[] {
  const queries: string[] = [];
  const company = job.companyName;

  for (const archetype of archetypes.slice(0, 3)) {
    switch (archetype) {
      case 'HIRING_MANAGER':
        queries.push(`"${company}" hiring manager engineering`);
        queries.push(`site:linkedin.com "${company}" "engineering manager"`);
        break;
      case 'ENG_MANAGER':
        queries.push(`site:linkedin.com "${company}" "engineering manager"`);
        queries.push(`"${company}" head of engineering`);
        break;
      case 'TEAM_LEAD':
        queries.push(`site:linkedin.com "${company}" "senior engineer" OR "tech lead"`);
        break;
      case 'TECH_RECRUITER':
        queries.push(
          `site:linkedin.com "${company}" "technical recruiter" OR "engineering recruiter"`,
        );
        break;
      case 'CAMPUS_RECRUITER':
        queries.push(`site:linkedin.com "${company}" "campus recruiter" OR "university recruiter"`);
        break;
      case 'FOUNDER':
        queries.push(`"${company}" founder CEO CTO`);
        queries.push(`site:linkedin.com "${company}" founder`);
        break;
    }
  }

  // Add company-specific queries
  queries.push(`"${company}" team engineering blog`);
  queries.push(`"${company}" careers team`);

  return queries;
}

/**
 * Use LLM to determine best contact strategy for complex cases
 */
export async function determineContactStrategyWithLLM(
  job: NormalizedJob,
): Promise<ContactStrategy> {
  const prompt = `Determine the best contact strategy for this job application.

Job: ${job.title} at ${job.companyName}
Location: ${job.location || 'Not specified'}
Seniority: ${job.seniority}

Who should the candidate contact? Prioritize these archetypes:
- HIRING_MANAGER: Direct decision-maker
- ENG_MANAGER: Engineering manager
- TEAM_LEAD: Senior engineer or tech lead
- TECH_RECRUITER: Technical recruiter
- CAMPUS_RECRUITER: For internships/new grad
- FOUNDER: For startups

Return JSON: {
  targetArchetypes: ["ARCHETYPE1", "ARCHETYPE2", ...],
  searchQueries: ["query1", "query2", ...],
  reasoning: "Brief explanation"
}`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.2,
      maxTokens: 512,
      timeout: 30000,
    });

    const parsed = JSON.parse(response);
    return {
      targetArchetypes: parsed.targetArchetypes || ['HIRING_MANAGER', 'TECH_RECRUITER'],
      searchQueries: parsed.searchQueries || [],
      reasoning: parsed.reasoning || '',
    };
  } catch {
    // Fall back to rule-based strategy
    return determineContactStrategy(job);
  }
}
