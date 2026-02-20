/**
 * Zod schemas for resume parsing output.
 */

import { z } from 'zod';

export const BasicInfoSchema = z.object({
  name: z.string(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  githubUrl: z.string().url().optional().nullable(),
  portfolioUrl: z.string().url().optional().nullable(),
  availability: z.string().optional().nullable(),
});

export type BasicInfo = z.infer<typeof BasicInfoSchema>;

export const EducationEntrySchema = z.object({
  institution: z.string(),
  degree: z.string().optional().nullable(),
  field: z.string().optional().nullable(),
  gpa: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  coursework: z.array(z.string()).default([]),
  awards: z.array(z.string()).default([]),
  leadership: z.array(z.string()).default([]),
});

export type EducationEntry = z.infer<typeof EducationEntrySchema>;

export const ExperienceEntrySchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  bullets: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
});

export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;

export const ProjectEntrySchema = z.object({
  name: z.string(),
  context: z.string().optional().nullable(),
  dates: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  technologies: z.array(z.string()).default([]),
  bullets: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
});

export type ProjectEntry = z.infer<typeof ProjectEntrySchema>;

export const SkillsSchema = z.object({
  proficient: z.array(z.string()).default([]),
  intermediate: z.array(z.string()).default([]),
  exploratory: z.array(z.string()).default([]),
  all: z.array(z.string()).default([]),
});

export type Skills = z.infer<typeof SkillsSchema>;

export const ParsedResumeSchema = z.object({
  rawText: z.string(),
  basicInfo: BasicInfoSchema,
  education: z.array(EducationEntrySchema).default([]),
  experience: z.array(ExperienceEntrySchema).default([]),
  projects: z.array(ProjectEntrySchema).default([]),
  skills: SkillsSchema,
  certifications: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
});

export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

export const ResumeParserInputSchema = z.object({
  filePath: z.string(),
});

export type ResumeParserInput = z.infer<typeof ResumeParserInputSchema>;

export const LLMSectionsOutputSchema = z.object({
  education: z.array(EducationEntrySchema).default([]),
  experience: z.array(ExperienceEntrySchema).default([]),
  projects: z.array(ProjectEntrySchema).default([]),
  skills: SkillsSchema,
  certifications: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
});

export type LLMSectionsOutput = z.infer<typeof LLMSectionsOutputSchema>;
