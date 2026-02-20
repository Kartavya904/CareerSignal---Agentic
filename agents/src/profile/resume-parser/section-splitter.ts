/**
 * Section Splitter - Uses LLM to identify and extract raw text sections from resume.
 * This is step 1 of the multi-step extraction process.
 *
 * Benefits:
 * - Small, focused prompt = fast response
 * - Outputs raw text segments, not structured data
 * - Each segment can be processed independently
 */

import { complete, parseJsonResponse } from '@careersignal/llm';
import { z } from 'zod';

const SectionSplitSchema = z.object({
  education: z.string().default(''),
  experience: z.string().default(''),
  projects: z.string().default(''),
  skills: z.string().default(''),
  certifications: z.string().default(''),
  languages: z.string().default(''),
});

export type SectionSplit = z.infer<typeof SectionSplitSchema>;

const SPLIT_PROMPT = `You are a resume section splitter. Your ONLY job is to identify and copy the raw text for each section.

Given the resume text below, extract the raw text content for each section. Copy the text EXACTLY as it appears - do not summarize or modify.

Return JSON with these fields (use empty string if section not found):
{
  "education": "Copy ALL text from the Education section including school names, degrees, dates, coursework, awards",
  "experience": "Copy ALL text from Work Experience/Employment section including company names, titles, dates, ALL bullet points",
  "projects": "Copy ALL text from Projects section including project names, dates, descriptions, ALL bullet points",
  "skills": "Copy ALL text from Skills/Technical Skills section",
  "certifications": "Copy ALL text from Certifications section",
  "languages": "Copy ALL text about spoken languages"
}

RESUME TEXT:
---
{resumeText}
---

Return ONLY the JSON object with raw text for each section.`;

export async function splitResumeSections(resumeText: string): Promise<SectionSplit> {
  const prompt = SPLIT_PROMPT.replace('{resumeText}', resumeText);

  try {
    // Use FAST model - this is a simple text segmentation task
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 8192, // Full resume might need more tokens
      timeout: 180000, // 3 minutes - account for model loading
    });

    const result = parseJsonResponse(response, SectionSplitSchema);

    if (!result.success || !result.data) {
      console.error('Failed to split resume sections:', result.error);
      return getDefaultSplit();
    }

    // Ensure all fields have defaults
    return {
      education: result.data.education ?? '',
      experience: result.data.experience ?? '',
      projects: result.data.projects ?? '',
      skills: result.data.skills ?? '',
      certifications: result.data.certifications ?? '',
      languages: result.data.languages ?? '',
    };
  } catch (error) {
    console.error('Section splitting failed:', error);
    return getDefaultSplit();
  }
}

function getDefaultSplit(): SectionSplit {
  return {
    education: '',
    experience: '',
    projects: '',
    skills: '',
    certifications: '',
    languages: '',
  };
}
