/**
 * Multi-Step Resume Section Extraction
 *
 * Step 1: Planner (FAST model) - Split resume into raw text sections
 * Step 2: Extractors (GENERAL model for complex, FAST for simple) - Parse each section
 *
 * Benefits:
 * - Smaller context per LLM call = faster, more reliable
 * - Focused prompts = better accuracy
 * - Parallel extraction possible
 */

import { splitResumeSections } from './section-splitter.js';
import {
  extractEducation,
  extractExperience,
  extractProjects,
  extractSkills,
  extractCertifications,
  extractLanguages,
} from './section-extractors.js';
import { type LLMSectionsOutput } from './schema.js';

export interface ExtractionProgress {
  step: string;
  status: 'pending' | 'running' | 'done' | 'error';
  message?: string;
}

export type ProgressCallback = (progress: ExtractionProgress) => void;

/**
 * Extract structured sections from resume text using multi-step approach.
 * Optionally accepts a progress callback for real-time updates.
 */
export async function extractSections(
  resumeText: string,
  onProgress?: ProgressCallback,
): Promise<LLMSectionsOutput> {
  const report = (step: string, status: ExtractionProgress['status'], message?: string) => {
    if (onProgress) {
      onProgress({ step, status, message });
    }
  };

  try {
    // Step 1: Split resume into sections (FAST model)
    report('split', 'running', 'Splitting resume into sections...');
    const sections = await splitResumeSections(resumeText);
    report('split', 'done', 'Resume split into sections');

    // Log section sizes for debugging
    console.log('[ResumeParser] Section sizes:', {
      education: sections.education.length,
      experience: sections.experience.length,
      projects: sections.projects.length,
      skills: sections.skills.length,
    });

    // Step 2: Extract using 8B model (FAST) first - keeps model loaded
    // Education, Skills, Certifications, Languages use FAST model

    report('education', 'running', 'Extracting education (8B model)...');
    const education = await extractEducation(sections.education);
    report('education', 'done', `Found ${education.length} entries`);

    report('skills', 'running', 'Extracting skills (8B model)...');
    const skills = await extractSkills(sections.skills);
    report('skills', 'done', `Found ${skills.all.length} skills`);

    const certifications = await extractCertifications(sections.certifications);
    const languages = await extractLanguages(sections.languages);

    // Step 3: Now switch to 32B model (GENERAL) for complex extractions
    // Experience and Projects need the more capable model

    report('experience', 'running', 'Extracting work experience (32B model)...');
    const experience = await extractExperience(sections.experience);
    report('experience', 'done', `Found ${experience.length} entries`);

    report('projects', 'running', 'Extracting projects (32B model)...');
    const projects = await extractProjects(sections.projects);
    report('projects', 'done', `Found ${projects.length} entries`);

    return {
      education,
      experience,
      projects,
      skills,
      certifications,
      languages,
    };
  } catch (error) {
    console.error('[ResumeParser] Multi-step extraction failed:', error);
    return getDefaultSections();
  }
}

function getDefaultSections(): LLMSectionsOutput {
  return {
    education: [],
    experience: [],
    projects: [],
    skills: {
      proficient: [],
      intermediate: [],
      exploratory: [],
      all: [],
    },
    certifications: [],
    languages: [],
  };
}

/**
 * Merge skills from LLM extraction to ensure 'all' contains everything.
 */
export function normalizeSkills(skills: LLMSectionsOutput['skills']): LLMSectionsOutput['skills'] {
  const allSkills = new Set<string>([
    ...skills.proficient,
    ...skills.intermediate,
    ...skills.exploratory,
    ...skills.all,
  ]);

  return {
    ...skills,
    all: Array.from(allSkills),
  };
}
