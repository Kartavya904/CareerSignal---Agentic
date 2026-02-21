/**
 * Types for Rank agents
 */

import { z } from 'zod';

export const DimensionMatchSchema = z.enum(['MATCH', 'MISMATCH', 'PARTIAL', 'UNKNOWN']);
export type DimensionMatch = z.infer<typeof DimensionMatchSchema>;

export const ScoreBreakdownSchema = z.object({
  ruleScore: z.number().min(0).max(100),
  llmScore: z.number().min(0).max(100).optional(),
  finalScore: z.number().min(0).max(100),
  dimensions: z.object({
    visaMatch: DimensionMatchSchema,
    locationMatch: DimensionMatchSchema,
    seniorityMatch: DimensionMatchSchema,
    skillsOverlap: z.number().min(0).max(1),
    experienceFit: z.number().min(0).max(1),
    industryMatch: DimensionMatchSchema,
    employmentTypeMatch: DimensionMatchSchema,
    remoteMatch: DimensionMatchSchema,
  }),
  explanation: z.string().optional(),
  evidence: z.array(z.string()).default([]),
});

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const ScoredJobSchema = z.object({
  jobId: z.string(),
  matchScore: z.number().min(0).max(100),
  scoreBreakdown: ScoreBreakdownSchema,
  strictFilterPass: z.boolean(),
  rank: z.number().optional(),
});

export type ScoredJob = z.infer<typeof ScoredJobSchema>;

/** Structured target location: country required; state/city optional (no city without state). */
export const TargetLocationSchema = z
  .object({
    country: z.string().min(1),
    state: z.string().optional(),
    city: z.string().optional(),
  })
  .refine((loc) => !loc.city || loc.state, { message: 'City requires state' });
export type TargetLocation = z.infer<typeof TargetLocationSchema>;

export const StrictFilterLevelSchema = z.enum(['STRICT', 'SEMI_STRICT', 'OFF']);
export type StrictFilterLevel = z.infer<typeof StrictFilterLevelSchema>;

export const UserPreferencesSchema = z.object({
  workAuthorization: z.enum(['US_CITIZEN', 'GREEN_CARD', 'H1B', 'OPT', 'EAD', 'OTHER']),
  targetLocations: z.array(TargetLocationSchema).default([]),
  remotePreference: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'ANY']).default('ANY'),
  targetSeniority: z.array(z.string()).default([]),
  targetRoles: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  employmentTypes: z.array(z.string()).default([]),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().optional(),
  strictFilterLevel: StrictFilterLevelSchema.default('STRICT'),
  maxContactsPerJob: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)]).default(2),
  outreachTone: z.string().optional(),
  /** @deprecated Use strictFilterLevel instead; kept for backward compatibility. */
  strictMode: z.boolean().optional(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const RankingConfigSchema = z.object({
  ruleWeight: z.number().min(0).max(1).default(0.4),
  llmWeight: z.number().min(0).max(1).default(0.6),
  strictFilterEnabled: z.boolean().default(true),
  topK: z.number().default(15),
});

export type RankingConfig = z.infer<typeof RankingConfigSchema>;
