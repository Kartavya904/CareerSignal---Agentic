import { z } from 'zod';
import {
  workAuthorizationEnum,
  seniorityEnum,
  employmentTypeEnum,
  remotePreferenceEnum,
} from './enums';

export const experienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  bullets: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
});

export const educationSchema = z.object({
  institution: z.string(),
  degree: z.string().optional().nullable(),
  field: z.string().optional().nullable(),
  gpa: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  coursework: z.array(z.string()).default([]),
  awards: z.array(z.string()).default([]),
  leadership: z.array(z.string()).default([]),
});

export const projectSchema = z.object({
  name: z.string(),
  context: z.string().optional().nullable(),
  dates: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  technologies: z.array(z.string()).default([]),
  bullets: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
});

export const skillsSchema = z.object({
  proficient: z.array(z.string()).default([]),
  intermediate: z.array(z.string()).default([]),
  exploratory: z.array(z.string()).default([]),
  all: z.array(z.string()).default([]),
});

export const salaryRangeSchema = z
  .object({
    min: z.number(),
    max: z.number(),
    currency: z.string().default('USD'),
  })
  .optional();

export const profileSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  location: z.string().min(1),
  work_authorization: workAuthorizationEnum,
  seniority: seniorityEnum.optional(),
  target_roles: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  highlighted_skills: z.array(z.string()).default([]),
  experience: z.array(experienceSchema).default([]),
  education: z.array(educationSchema).default([]),
  projects: z.array(projectSchema).default([]),
  certifications: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  salary_range: salaryRangeSchema,
  employment_type: z.array(employmentTypeEnum).default([]),
  remote_preference: remotePreferenceEnum.optional(),
  linkedin_url: z.string().url().optional().nullable().or(z.literal('')),
  github_url: z.string().url().optional().nullable().or(z.literal('')),
  portfolio_url: z.string().url().optional().nullable().or(z.literal('')),
  resume_raw_text: z.string().optional(),
  resume_file_ref: z.string().optional(),
  resume_parsed_at: z.coerce.date().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Experience = z.infer<typeof experienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Skills = z.infer<typeof skillsSchema>;
export type SalaryRange = z.infer<typeof salaryRangeSchema>;
export type Profile = z.infer<typeof profileSchema>;

/** Input for creating/updating a profile (e.g. from form) */
export const profileInputSchema = profileSchema.partial().required({
  name: true,
  location: true,
  work_authorization: true,
});
export type ProfileInput = z.infer<typeof profileInputSchema>;
