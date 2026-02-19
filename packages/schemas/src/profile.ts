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
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  description: z.string().optional(),
});

export const educationSchema = z.object({
  institution: z.string(),
  degree: z.string().optional(),
  field: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
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
  experience: z.array(experienceSchema).default([]),
  education: z.array(educationSchema).default([]),
  certifications: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  salary_range: salaryRangeSchema,
  employment_type: z.array(employmentTypeEnum).default([]),
  remote_preference: remotePreferenceEnum.optional(),
  resume_raw_text: z.string().optional(),
  resume_file_ref: z.string().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Experience = z.infer<typeof experienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type SalaryRange = z.infer<typeof salaryRangeSchema>;
export type Profile = z.infer<typeof profileSchema>;

/** Input for creating/updating a profile (e.g. from form) */
export const profileInputSchema = profileSchema.partial().required({
  name: true,
  location: true,
  work_authorization: true,
});
export type ProfileInput = z.infer<typeof profileInputSchema>;
