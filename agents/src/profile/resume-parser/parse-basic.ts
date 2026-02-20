/**
 * Basic info extraction using regex patterns.
 * Code-only step - extracts structured data without LLM.
 */

import type { BasicInfo } from './schema.js';

/**
 * Extract email addresses from text.
 */
export function extractEmail(text: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches?.[0] ?? null;
}

/**
 * Extract phone numbers from text.
 * Handles formats: (XXX) XXX-XXXX, XXX-XXX-XXXX, (XXX)-XXX-XXXX
 */
export function extractPhone(text: string): string | null {
  const phoneRegex = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const matches = text.match(phoneRegex);
  return matches?.[0] ?? null;
}

/**
 * Extract location (City, ST format).
 */
export function extractLocation(text: string): string | null {
  // Match "City, ST" patterns - use [ ] instead of \s to avoid matching newlines
  // Common patterns: "Cincinnati, OH", "New York, NY", "San Francisco, CA"
  const locationRegex = /([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)*),[ ]*([A-Z]{2})\b/g;
  const matches = text.match(locationRegex);

  if (matches?.[0]) {
    return matches[0].trim();
  }

  // Try with full state name: "Cincinnati, Ohio"
  const fullStateRegex = /([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)*),[ ]*([A-Z][a-z]+)\b/g;
  const fullStateMatches = text.match(fullStateRegex);

  if (fullStateMatches?.[0]) {
    return fullStateMatches[0].trim();
  }

  return null;
}

/**
 * Extract LinkedIn URL.
 */
export function extractLinkedIn(text: string): string | null {
  const linkedinRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/gi;
  const matches = text.match(linkedinRegex);

  if (matches?.[0]) {
    let url = matches[0];
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    return url;
  }

  return null;
}

/**
 * Extract GitHub URL.
 */
export function extractGitHub(text: string): string | null {
  const githubRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/gi;
  const matches = text.match(githubRegex);

  if (matches?.[0]) {
    let url = matches[0];
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    return url;
  }

  return null;
}

/**
 * Extract portfolio/personal website URL.
 */
export function extractPortfolio(text: string): string | null {
  // Look for personal domain patterns (excluding linkedin, github)
  const urlRegex = /(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|dev|io|me|tech|xyz|co)(?:\/[\w-]*)?/gi;
  const matches = text.match(urlRegex);

  if (matches) {
    for (const match of matches) {
      const lower = match.toLowerCase();
      if (
        !lower.includes('linkedin') &&
        !lower.includes('github') &&
        !lower.includes('devpost') &&
        !lower.includes('mail.')
      ) {
        let url = match;
        if (!url.startsWith('http')) {
          url = 'https://' + url;
        }
        return url;
      }
    }
  }

  return null;
}

/**
 * Extract name from the top of the resume.
 * Assumes name is in ALL CAPS or is the first prominent text.
 */
export function extractName(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Look for ALL CAPS name (common resume format)
  for (const line of lines.slice(0, 5)) {
    // Skip lines that look like headers or availability statements
    if (
      line.toLowerCase().includes('available') ||
      line.toLowerCase().includes('entry level') ||
      (line.includes('|') && line.split('|').length > 2)
    ) {
      continue;
    }

    // Check if line is mostly uppercase letters (name pattern)
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    const lowerCount = (line.match(/[a-z]/g) || []).length;

    if (upperCount > lowerCount && upperCount >= 4 && line.length < 50) {
      // Clean up and title case
      return line
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // Fallback: use first non-header line
  for (const line of lines.slice(0, 3)) {
    if (line.length > 2 && line.length < 50 && !line.includes('@')) {
      return line;
    }
  }

  return 'Unknown';
}

/**
 * Extract availability statement if present.
 */
export function extractAvailability(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim());

  for (const line of lines.slice(0, 5)) {
    const lower = line.toLowerCase();
    if (lower.includes('available') || lower.includes('starting')) {
      return line;
    }
  }

  return null;
}

/**
 * Extract all basic info from resume text.
 */
export function extractBasicInfo(text: string): BasicInfo {
  return {
    name: extractName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
    location: extractLocation(text),
    linkedinUrl: extractLinkedIn(text),
    githubUrl: extractGitHub(text),
    portfolioUrl: extractPortfolio(text),
    availability: extractAvailability(text),
  };
}
