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

// Contact priority by job type — ordered from most to least desirable
const CONTACT_PRIORITIES: Record<string, ContactArchetype[]> = {
  engineering: [
    'HIRING_MANAGER',
    'ENG_MANAGER',
    'TEAM_LEAD',
    'TECH_RECRUITER',
    'CAMPUS_RECRUITER',
    'FOUNDER',
  ],
  internship: [
    'CAMPUS_RECRUITER',
    'TECH_RECRUITER',
    'HIRING_MANAGER',
    'ENG_MANAGER',
    'TEAM_LEAD',
    'FOUNDER',
  ],
  startup: [
    'FOUNDER',
    'HIRING_MANAGER',
    'ENG_MANAGER',
    'TEAM_LEAD',
    'TECH_RECRUITER',
    'CAMPUS_RECRUITER',
  ],
  default: [
    'HIRING_MANAGER',
    'TECH_RECRUITER',
    'ENG_MANAGER',
    'TEAM_LEAD',
    'CAMPUS_RECRUITER',
    'FOUNDER',
  ],
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
  const linkedInQueries = generateLinkedInQueries(job, archetypes);

  return {
    targetArchetypes: archetypes,
    searchQueries: queries,
    linkedInQueries,
    reasoning: `Job type: ${jobType}, Company size: ${companySize || 'unknown'}`,
  };
}

function classifyJobType(job: NormalizedJob): string {
  const titleLower = job.title.toLowerCase();

  // Detect internship/new grad
  const isNewGrad =
    titleLower.includes('202') ||
    titleLower.includes('grad') ||
    titleLower.includes('entry') ||
    titleLower.includes('junior');
  if (job.seniority === 'INTERN' || isNewGrad) return 'internship';

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
        queries.push(`"${company}" "tech lead" OR "staff engineer" team`);
        break;
      case 'TECH_RECRUITER':
        queries.push(
          `site:linkedin.com "${company}" "technical recruiter" OR "engineering recruiter"`,
        );
        queries.push(`"${company}" technical talent acquisition`);
        break;
      case 'CAMPUS_RECRUITER':
        queries.push(`site:linkedin.com "${company}" "campus recruiter" OR "university recruiter"`);
        queries.push(`"${company}" university relations manager`);
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
 * Generate job-title-anchored LinkedIn queries for ALL archetypes.
 * 2 queries per archetype. Uses keyword-style matching (no quotes on the job title)
 * because LinkedIn profiles rarely contain the exact posted title verbatim.
 */
function generateLinkedInQueries(job: NormalizedJob, archetypes: ContactArchetype[]): string[] {
  const queries: string[] = [];
  const company = job.companyName;
  // Extract core keywords from job title: strip year, parentheticals, dashes, special chars
  const titleKeywords = job.title
    .replace(/[-–—]/g, ' ')
    .replace(/\b\d{4}\b/g, '') // strip years like 2026
    .replace(/\([^)]*\)/g, '') // strip (US), (Remote), etc.
    .replace(/[|,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract location keywords (city and/or country)
  const locationKeywords = job.location
    ? job.location
        .split(/[,|\s]+/)
        .map((k) => k.trim())
        .filter((k) => k.length > 2)
        .slice(0, 2)
        .join(' ')
    : '';

  // Generate 2 targeted queries per archetype, biased toward LinkedIn *people* profiles.
  for (const archetype of archetypes) {
    const locPrefix = locationKeywords ? `${locationKeywords} ` : '';
    switch (archetype) {
      case 'HIRING_MANAGER':
        queries.push(
          `site:linkedin.com/in "${company}" ${locPrefix}${titleKeywords} hiring manager people`,
        );
        queries.push(`site:linkedin.com/in "${company}" hiring manager software engineer people`);
        break;
      case 'ENG_MANAGER':
        queries.push(
          `site:linkedin.com/in "${company}" ${locPrefix}${titleKeywords} engineering manager people`,
        );
        queries.push(`site:linkedin.com/in "${company}" engineering manager software people`);
        break;
      case 'TEAM_LEAD':
        queries.push(
          `site:linkedin.com/in "${company}" ${locPrefix}${titleKeywords} tech lead OR team lead people`,
        );
        queries.push(`site:linkedin.com/in "${company}" senior engineer OR staff engineer people`);
        break;
      case 'TECH_RECRUITER':
        queries.push(
          `site:linkedin.com/in "${company}" ${locPrefix}${titleKeywords} technical recruiter people`,
        );
        queries.push(`site:linkedin.com/in "${company}" recruiter software engineer people`);
        break;
      case 'CAMPUS_RECRUITER':
        queries.push(
          `site:linkedin.com/in "${company}" ${locPrefix}${titleKeywords} campus recruiter people`,
        );
        queries.push(
          `site:linkedin.com/in "${company}" university recruiter OR campus hiring people`,
        );
        break;
      case 'FOUNDER':
        queries.push(`site:linkedin.com/in "${company}" "${company}" founder OR CEO OR CTO people`);
        queries.push(`site:linkedin.com/in "${company}" co-founder engineer people`);
        break;
      default:
        // FALLBACK archetype - generic company search
        queries.push(`site:linkedin.com/in "${company}" ${locPrefix}${titleKeywords} people`);
        break;
    }
  }

  // One final catch-all query for broad matches at this company
  queries.push(`site:linkedin.com/in "${company}" ${locationKeywords} ${titleKeywords} people`);

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
  linkedInQueries: ["query1", "query2", ...],
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
      linkedInQueries: parsed.linkedInQueries || [],
      reasoning: parsed.reasoning || '',
    };
  } catch {
    // Fall back to rule-based strategy
    return determineContactStrategy(job);
  }
}
