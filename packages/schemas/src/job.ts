import { z } from 'zod';
import { seniorityEnum, employmentTypeEnum, visaSponsorshipEnum } from './enums';

const remoteTypeEnum = z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN']);

export const jobSchema = z.object({
  id: z.string().uuid().optional(),
  run_id: z.string().uuid().optional(),
  source_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  title: z.string().min(1),
  company_name: z.string().min(1),
  source_url: z.string().url(),
  location: z.string().optional(),
  remote_type: remoteTypeEnum.optional(),
  seniority: seniorityEnum.optional(),
  employment_type: employmentTypeEnum.optional(),
  visa_sponsorship: visaSponsorshipEnum.optional(),
  description: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  posted_date: z.coerce.date().optional(),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  salary_currency: z.string().optional(),
  department: z.string().optional(),
  team: z.string().optional(),
  apply_url: z.string().optional(),
  raw_extract: z.record(z.unknown()).optional(),
  evidence_refs: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  dedupe_key: z.string().optional(),
  match_score: z.number().min(0).max(99.99).optional(),
  score_breakdown: z.record(z.unknown()).optional(),
  score_explanation: z.string().optional(),
  strict_filter_pass: z.boolean().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Job = z.infer<typeof jobSchema>;
