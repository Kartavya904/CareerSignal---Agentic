/**
 * People Search Agent - Hunts contacts via public web
 *
 * Responsibilities:
 * - Search public web for people
 * - Parse LinkedIn profiles (public)
 * - Search GitHub org members
 * - Find team pages and org charts
 *
 * LLM Usage: Medium (identify relevant people from search results)
 */

import { complete } from '@careersignal/llm';
import type { ContactSearchResult, ContactArchetype } from './types.js';

export interface SearchConfig {
  maxResults: number;
  timeout: number;
  sources: ('linkedin' | 'github' | 'web')[];
}

const DEFAULT_CONFIG: SearchConfig = {
  maxResults: 10,
  timeout: 30000,
  sources: ['linkedin', 'web', 'github'],
};

/**
 * Search for people matching the target archetype
 */
export async function searchForPeople(
  company: string,
  targetArchetypes: ContactArchetype[],
  queries: string[],
  config: SearchConfig = DEFAULT_CONFIG,
): Promise<ContactSearchResult[]> {
  const results: ContactSearchResult[] = [];

  // Note: Actual implementation would use web search APIs
  // This is a placeholder showing the structure

  for (const query of queries.slice(0, 5)) {
    // Placeholder - would actually perform web search
    console.log(`[PeopleSearch] Would search: ${query}`);
  }

  return results;
}

/**
 * Search GitHub org for team members
 */
export async function searchGitHubOrg(orgName: string): Promise<ContactSearchResult[]> {
  const results: ContactSearchResult[] = [];

  try {
    // GitHub API is free for public data
    const response = await fetch(`https://api.github.com/orgs/${orgName}/members`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CareerSignal/1.0',
      },
    });

    if (!response.ok) return results;

    const members = (await response.json()) as { login: string; html_url: string }[];

    for (const member of members.slice(0, 10)) {
      results.push({
        name: member.login,
        company: orgName,
        linkedinUrl: undefined,
        evidenceUrl: member.html_url,
        evidenceSnippet: `GitHub member of ${orgName}`,
        confidence: 0.3, // Low confidence - just GitHub username
        source: 'github',
      });
    }
  } catch (error) {
    console.error('[PeopleSearch] GitHub search failed:', error);
  }

  return results;
}

/**
 * Extract people from company team page HTML
 */
export async function extractFromTeamPage(
  html: string,
  company: string,
  pageUrl: string,
): Promise<ContactSearchResult[]> {
  // Use LLM to extract team members from HTML
  const truncatedHtml = html.substring(0, 10000);

  const prompt = `Extract team member information from this company team page.

For each person found, extract:
- name: Full name
- role: Job title/role
- linkedinUrl: LinkedIn URL if present

Return JSON array: [{ name, role, linkedinUrl }, ...]

HTML:
${truncatedHtml}`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 1024,
      timeout: 30000,
    });

    const parsed = JSON.parse(response);
    const people = Array.isArray(parsed) ? parsed : [];

    return people.map((person: { name?: string; role?: string; linkedinUrl?: string }) => ({
      name: person.name || 'Unknown',
      role: person.role,
      company,
      linkedinUrl: person.linkedinUrl,
      evidenceUrl: pageUrl,
      evidenceSnippet: `Found on ${company} team page`,
      confidence: 0.7,
      source: 'team_page',
    }));
  } catch {
    return [];
  }
}

/**
 * Filter results to match target archetypes
 */
export function filterByArchetype(
  results: ContactSearchResult[],
  targetArchetypes: ContactArchetype[],
): ContactSearchResult[] {
  const archetypeKeywords: Record<ContactArchetype, string[]> = {
    HIRING_MANAGER: ['hiring manager', 'hiring'],
    ENG_MANAGER: [
      'engineering manager',
      'eng manager',
      'head of engineering',
      'director of engineering',
    ],
    TEAM_LEAD: ['tech lead', 'team lead', 'senior engineer', 'staff engineer', 'principal'],
    TECH_RECRUITER: ['technical recruiter', 'engineering recruiter', 'talent acquisition'],
    CAMPUS_RECRUITER: ['campus recruiter', 'university recruiter', 'early career'],
    FOUNDER: ['founder', 'ceo', 'cto', 'co-founder', 'chief'],
    FALLBACK: [],
  };

  return results.filter((result) => {
    if (!result.role) return true; // Include if no role (might be relevant)

    const roleLower = result.role.toLowerCase();

    for (const archetype of targetArchetypes) {
      const keywords = archetypeKeywords[archetype];
      if (keywords.some((keyword) => roleLower.includes(keyword))) {
        return true;
      }
    }

    return false;
  });
}
