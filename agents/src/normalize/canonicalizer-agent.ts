/**
 * Canonicalizer Agent - Standardizes job fields to canonical forms
 *
 * Responsibilities:
 * - Standardize job titles to common taxonomy
 * - Normalize locations to city, state/country format
 * - Expand abbreviations
 * - Map seniority keywords to levels
 *
 * LLM Usage: Light (normalize exotic titles to standard taxonomy)
 */

import type { SeniorityLevel, RemoteType } from './types.js';

// Title standardization mappings
const TITLE_MAPPINGS: Record<string, string> = {
  swe: 'Software Engineer',
  sde: 'Software Development Engineer',
  fe: 'Frontend Engineer',
  be: 'Backend Engineer',
  fs: 'Full Stack Engineer',
  ml: 'Machine Learning Engineer',
  mle: 'Machine Learning Engineer',
  de: 'Data Engineer',
  ds: 'Data Scientist',
  devops: 'DevOps Engineer',
  sre: 'Site Reliability Engineer',
  qa: 'QA Engineer',
  pm: 'Product Manager',
  tpm: 'Technical Program Manager',
  em: 'Engineering Manager',
};

// Seniority keywords to levels
const SENIORITY_KEYWORDS: Record<string, SeniorityLevel> = {
  intern: 'INTERN',
  internship: 'INTERN',
  'co-op': 'INTERN',
  coop: 'INTERN',
  junior: 'JUNIOR',
  jr: 'JUNIOR',
  entry: 'JUNIOR',
  'new grad': 'JUNIOR',
  associate: 'JUNIOR',
  mid: 'MID',
  'mid-level': 'MID',
  intermediate: 'MID',
  senior: 'SENIOR',
  sr: 'SENIOR',
  lead: 'SENIOR',
  staff: 'STAFF',
  principal: 'PRINCIPAL',
  architect: 'PRINCIPAL',
  distinguished: 'PRINCIPAL',
  fellow: 'PRINCIPAL',
  director: 'DIRECTOR',
  'head of': 'DIRECTOR',
  vp: 'VP',
  'vice president': 'VP',
  cto: 'C_LEVEL',
  ceo: 'C_LEVEL',
  chief: 'C_LEVEL',
};

// Remote type keywords
const REMOTE_KEYWORDS: Record<string, RemoteType> = {
  remote: 'REMOTE',
  'work from home': 'REMOTE',
  wfh: 'REMOTE',
  'fully remote': 'REMOTE',
  '100% remote': 'REMOTE',
  hybrid: 'HYBRID',
  flexible: 'HYBRID',
  'on-site': 'ONSITE',
  onsite: 'ONSITE',
  'in-office': 'ONSITE',
  'office-based': 'ONSITE',
};

// US State abbreviations
const US_STATES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

/**
 * Canonicalize job title
 */
export function canonicalizeTitle(title: string): string {
  let normalized = title.trim();

  // Expand common abbreviations
  for (const [abbrev, full] of Object.entries(TITLE_MAPPINGS)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    normalized = normalized.replace(regex, full);
  }

  // Clean up extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Title case
  normalized = normalized
    .split(' ')
    .map((word) => {
      // Keep Roman numerals uppercase
      if (/^[IVX]+$/.test(word)) return word;
      // Keep common abbreviations uppercase
      if (
        ['AI', 'ML', 'API', 'UI', 'UX', 'AWS', 'GCP', 'ETL', 'SQL', 'NLP'].includes(
          word.toUpperCase(),
        )
      ) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return normalized;
}

/**
 * Canonicalize location
 */
export function canonicalizeLocation(location: string): string {
  let normalized = location.trim();

  // Expand US state abbreviations
  for (const [abbrev, full] of Object.entries(US_STATES)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'g');
    if (regex.test(normalized) && !normalized.includes(full)) {
      // Only expand if it looks like a state (e.g., "San Francisco, CA")
      if (normalized.includes(',')) {
        normalized = normalized.replace(regex, full);
      }
    }
  }

  // Clean up
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Detect seniority from title
 */
export function detectSeniority(title: string): SeniorityLevel {
  const lowerTitle = title.toLowerCase();

  for (const [keyword, level] of Object.entries(SENIORITY_KEYWORDS)) {
    if (lowerTitle.includes(keyword)) {
      return level;
    }
  }

  return 'UNKNOWN';
}

/**
 * Detect remote type from text
 */
export function detectRemoteType(text: string): RemoteType {
  const lowerText = text.toLowerCase();

  for (const [keyword, type] of Object.entries(REMOTE_KEYWORDS)) {
    if (lowerText.includes(keyword)) {
      return type;
    }
  }

  return 'UNKNOWN';
}

/**
 * Normalize company name
 */
export function canonicalizeCompany(company: string): string {
  let normalized = company.trim();

  // Remove common suffixes
  normalized = normalized.replace(/\s+(Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Company|Co\.?)$/i, '');

  // Clean up
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}
