/**
 * Types for Outreach agents
 */

import { z } from 'zod';

export const OutreachPlatformSchema = z.enum(['LINKEDIN_CONNECTION', 'LINKEDIN_DM', 'EMAIL']);

export type OutreachPlatform = z.infer<typeof OutreachPlatformSchema>;

export const OutreachToneSchema = z.enum(['CONCISE', 'WARM', 'TECHNICAL']);

export type OutreachTone = z.infer<typeof OutreachToneSchema>;

export const OutreachDraftSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  contactId: z.string(),
  platform: OutreachPlatformSchema,
  variant: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  characterCount: z.number(),
  withinLimit: z.boolean(),
  tone: OutreachToneSchema,
  personalizationHooks: z.array(z.string()).default([]),
  status: z.enum(['DRAFT', 'APPROVED', 'SENT_MANUALLY', 'ARCHIVED']).default('DRAFT'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OutreachDraft = z.infer<typeof OutreachDraftSchema>;

export const PlatformLimitsSchema = z.object({
  LINKEDIN_CONNECTION: z.number().default(300),
  LINKEDIN_DM: z.number().default(1900),
  EMAIL: z.number().default(2000),
});

export const PLATFORM_LIMITS = {
  LINKEDIN_CONNECTION: 300,
  LINKEDIN_DM: 1900,
  EMAIL: 2000,
};

export const PersonalizationHookSchema = z.object({
  type: z.enum(['company', 'job', 'team', 'tech', 'recent_news', 'shared_interest']),
  hook: z.string(),
  source: z.string().optional(),
});

export type PersonalizationHook = z.infer<typeof PersonalizationHookSchema>;
