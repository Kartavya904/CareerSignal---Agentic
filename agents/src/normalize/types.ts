/**
 * Types for Normalize agents
 */

import { z } from 'zod';

export const SeniorityLevelSchema = z.enum([
  'INTERN',
  'JUNIOR',
  'MID',
  'SENIOR',
  'STAFF',
  'PRINCIPAL',
  'DIRECTOR',
  'VP',
  'C_LEVEL',
  'UNKNOWN',
]);

export type SeniorityLevel = z.infer<typeof SeniorityLevelSchema>;

export const RemoteTypeSchema = z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN']);

export type RemoteType = z.infer<typeof RemoteTypeSchema>;

export const EmploymentTypeSchema = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'INTERNSHIP',
  'UNKNOWN',
]);

export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;

export const VisaSponsorshipSchema = z.enum(['YES', 'NO', 'UNKNOWN']);

export type VisaSponsorship = z.infer<typeof VisaSponsorshipSchema>;

export const NormalizedJobSchema = z.object({
  id: z.string(),
  runId: z.string(),
  sourceId: z.string(),

  // Core fields (required)
  title: z.string(),
  companyName: z.string(),
  sourceUrl: z.string(),

  // Important fields
  location: z.string().optional(),
  remoteType: RemoteTypeSchema.default('UNKNOWN'),
  seniority: SeniorityLevelSchema.default('UNKNOWN'),
  employmentType: EmploymentTypeSchema.default('UNKNOWN'),
  visaSponsorship: VisaSponsorshipSchema.default('UNKNOWN'),

  // Detail fields
  description: z.string().optional(),
  requirements: z.array(z.string()).default([]),
  postedDate: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().optional(),
  department: z.string().optional(),
  team: z.string().optional(),
  applyUrl: z.string().optional(),

  // Metadata
  rawExtract: z.record(z.unknown()).optional(),
  evidenceRefs: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  dedupeKey: z.string(),

  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;

export const DedupeResultSchema = z.object({
  originalCount: z.number(),
  deduplicatedCount: z.number(),
  mergedPairs: z.array(
    z.object({
      kept: z.string(),
      merged: z.string(),
      similarity: z.number(),
    }),
  ),
});

export type DedupeResult = z.infer<typeof DedupeResultSchema>;
