/**
 * Section Extractors - Individual extractors for each resume section.
 * Each extractor receives ONLY the relevant section text, keeping context small.
 */

import { complete } from '@careersignal/llm';
import { z } from 'zod';
import {
  EducationEntrySchema,
  ExperienceEntrySchema,
  ProjectEntrySchema,
  SkillsSchema,
  type EducationEntry,
  type ExperienceEntry,
  type ProjectEntry,
  type Skills,
} from './schema.js';

/**
 * Flexible JSON parser that handles common LLM output variations.
 * Tries multiple strategies to extract valid entries from LLM response.
 */
function extractArrayFromResponse<T>(
  response: string,
  schema: z.ZodSchema<T>,
  arrayKey?: string,
): T[] {
  try {
    const parsed = JSON.parse(response);

    // Strategy 1: Already an array at top level
    if (Array.isArray(parsed)) {
      console.log('[Parser] Strategy 1: Top-level array with', parsed.length, 'items');
      const results: T[] = [];
      for (const item of parsed) {
        const result = schema.safeParse(item);
        if (result.success) {
          results.push(result.data);
        } else {
          console.log('[Parser] Item failed validation:', result.error.issues[0]?.message);
        }
      }
      return results;
    }

    // Strategy 2: Single object - try to validate directly (MOST COMMON CASE)
    // Do this BEFORE looking for nested arrays to avoid false positives
    const singleResult = schema.safeParse(parsed);
    if (singleResult.success) {
      console.log('[Parser] Strategy 2: Single object validated successfully');
      return [singleResult.data];
    }

    // Strategy 3: Object with expected key containing array of objects
    if (arrayKey && parsed[arrayKey] && Array.isArray(parsed[arrayKey])) {
      // Check if items are objects (not primitive strings)
      if (parsed[arrayKey].length > 0 && typeof parsed[arrayKey][0] === 'object') {
        console.log('[Parser] Strategy 3: Array at key', arrayKey);
        const results: T[] = [];
        for (const item of parsed[arrayKey]) {
          const result = schema.safeParse(item);
          if (result.success) results.push(result.data);
        }
        return results;
      }
    }

    // Strategy 4: Look for array of OBJECTS (not strings) at any key
    for (const key of Object.keys(parsed)) {
      const val = parsed[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        console.log('[Parser] Strategy 4: Found object array at key:', key);
        const results: T[] = [];
        for (const item of val) {
          const result = schema.safeParse(item);
          if (result.success) results.push(result.data);
        }
        if (results.length > 0) return results;
      }
    }

    // If we get here, log what went wrong with single object validation
    console.error(
      '[Parser] All strategies failed. Single object error:',
      singleResult.error.issues,
    );
    console.error('[Parser] Object keys:', Object.keys(parsed));
    return [];
  } catch (error) {
    console.error('[Parser] JSON parse error:', error);
    return [];
  }
}

// ============== EDUCATION EXTRACTOR ==============

const EDUCATION_PROMPT = `Extract ALL education entries from this resume text.

For each education entry, extract:
- institution: School name
- degree: Degree type (Bachelor of Science, etc.)
- field: Major/field of study  
- gpa: GPA if mentioned (string)
- startDate: Start date (string or null)
- endDate: End date or "Expected May 2026" (string)
- coursework: Array of courses
- awards: Array of honors/awards
- leadership: Array of clubs/orgs

EDUCATION TEXT:
---
{text}
---

Return a JSON array of education entries: [{ institution, degree, field, gpa, startDate, endDate, coursework, awards, leadership }]`;

export async function extractEducation(sectionText: string): Promise<EducationEntry[]> {
  if (!sectionText.trim()) return [];

  const prompt = EDUCATION_PROMPT.replace('{text}', sectionText);

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 2048,
      timeout: 180000,
    });

    console.log('[Education] Raw LLM response:', response.substring(0, 300));

    const entries = extractArrayFromResponse(response, EducationEntrySchema, 'education');
    console.log('[Education] Extracted entries:', entries.length);

    // Ensure all array fields have defaults
    return entries.map((edu) => ({
      ...edu,
      coursework: edu.coursework ?? [],
      awards: edu.awards ?? [],
      leadership: edu.leadership ?? [],
    }));
  } catch (error) {
    console.error('Education extraction failed:', error);
    return [];
  }
}

// ============== EXPERIENCE EXTRACTOR ==============

const EXPERIENCE_PROMPT = `Extract ALL work experiences from this resume text.

CRITICAL: Extract EVERY bullet point EXACTLY as written. Do not skip or summarize any bullet.

For each experience, extract:
- company: Company name (string)
- title: Job title (string)
- location: City, State (string or null)
- startDate: Start date e.g. "Jan 2024" (string)
- endDate: End date or "Present" (string)
- description: null
- bullets: Array of EVERY bullet point - copy each one EXACTLY word for word
- projects: Array of project names mentioned (or empty array)

EXPERIENCE TEXT:
---
{text}
---

Return a JSON array of ALL work experiences: [{ company, title, location, startDate, endDate, description, bullets, projects }]
IMPORTANT: Return an array even if there is only one experience.`;

export async function extractExperience(sectionText: string): Promise<ExperienceEntry[]> {
  if (!sectionText.trim()) return [];

  const prompt = EXPERIENCE_PROMPT.replace('{text}', sectionText);

  try {
    // Use GENERAL (32B) model for better accuracy on complex work experience
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 8192,
      timeout: 600000, // 10 minutes - no timeout pressure
    });

    console.log('[Experience] Raw LLM response:', response.substring(0, 500));

    const entries = extractArrayFromResponse(response, ExperienceEntrySchema, 'experience');
    console.log('[Experience] Extracted entries:', entries.length);

    // Ensure all array fields have defaults
    return entries.map((exp) => ({
      ...exp,
      bullets: exp.bullets ?? [],
      projects: exp.projects ?? [],
    }));
  } catch (error) {
    console.error('Experience extraction failed:', error);
    return [];
  }
}

// ============== PROJECTS EXTRACTOR ==============

const PROJECTS_PROMPT = `Extract ALL projects from this resume text.

CRITICAL: Extract EVERY bullet point EXACTLY as written. Do not skip or summarize any.

For each project, extract:
- name: Project name (string)
- context: Context like Hackathon name, "Personal Project", "Course Project" (string or null)
- dates: Date range if mentioned (string or null)
- description: null
- technologies: Array of technologies/tools used
- bullets: Array of EVERY bullet point - copy each one EXACTLY
- achievements: Array of awards/recognition e.g. "1st Place", "Best Use of API" (or empty array)

PROJECTS TEXT:
---
{text}
---

Return a JSON array of ALL projects: [{ name, context, dates, description, technologies, bullets, achievements }]
IMPORTANT: Return an array even if there is only one project.`;

export async function extractProjects(sectionText: string): Promise<ProjectEntry[]> {
  if (!sectionText.trim()) return [];

  const prompt = PROJECTS_PROMPT.replace('{text}', sectionText);

  try {
    // Use GENERAL (32B) model for better accuracy on complex projects
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 8192,
      timeout: 600000, // 10 minutes - no timeout pressure
    });

    console.log('[Projects] Raw LLM response:', response.substring(0, 500));

    const entries = extractArrayFromResponse(response, ProjectEntrySchema, 'projects');
    console.log('[Projects] Extracted entries:', entries.length);

    // Ensure all array fields have defaults
    return entries.map((proj) => ({
      ...proj,
      technologies: proj.technologies ?? [],
      bullets: proj.bullets ?? [],
      achievements: proj.achievements ?? [],
    }));
  } catch (error) {
    console.error('Projects extraction failed:', error);
    return [];
  }
}

// ============== SKILLS EXTRACTOR ==============

const SKILLS_PROMPT = `Extract ALL skills from this resume text.

Categorize skills if possible:
- proficient: Skills marked as expert/proficient (array of strings)
- intermediate: Skills at intermediate level (array of strings)
- exploratory: Skills at basic/learning level (array of strings)
- all: Every single skill mentioned (array of strings)

SKILLS TEXT:
---
{text}
---

Return JSON object: { "proficient": [...], "intermediate": [...], "exploratory": [...], "all": [...] }`;

export async function extractSkills(sectionText: string): Promise<Skills> {
  const defaultSkills: Skills = { proficient: [], intermediate: [], exploratory: [], all: [] };

  if (!sectionText.trim()) {
    return defaultSkills;
  }

  const prompt = SKILLS_PROMPT.replace('{text}', sectionText);

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 2048,
      timeout: 180000,
    });

    console.log('[Skills] Raw LLM response:', response.substring(0, 300));

    // Skills returns an object, not an array - parse directly
    const parsed = JSON.parse(response);
    const result = SkillsSchema.safeParse(parsed);

    if (!result.success) {
      console.error('[Skills] Parse failed:', result.error.message);
      return defaultSkills;
    }

    console.log('[Skills] Parsed all skills count:', result.data.all?.length ?? 0);

    return {
      proficient: result.data.proficient ?? [],
      intermediate: result.data.intermediate ?? [],
      exploratory: result.data.exploratory ?? [],
      all: result.data.all ?? [],
    };
  } catch (error) {
    console.error('Skills extraction failed:', error);
    return defaultSkills;
  }
}

// ============== SIMPLE EXTRACTORS ==============

export async function extractCertifications(sectionText: string): Promise<string[]> {
  if (!sectionText.trim()) return [];

  const prompt = `Extract all certifications from this text as a JSON array of strings.

TEXT: ${sectionText}

Return JSON array: ["Certification 1", "Certification 2", ...]`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 512,
      timeout: 60000,
    });

    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

export async function extractLanguages(sectionText: string): Promise<string[]> {
  if (!sectionText.trim()) return [];

  const prompt = `Extract all spoken languages from this text as a JSON array of strings.

TEXT: ${sectionText}

Return JSON array: ["English", "Spanish", ...]`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 256,
      timeout: 60000,
    });

    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}
