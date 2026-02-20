/**
 * Types for Contact agents
 */

import { z } from 'zod';

export const ContactArchetypeSchema = z.enum([
  'HIRING_MANAGER',
  'ENG_MANAGER',
  'TEAM_LEAD',
  'TECH_RECRUITER',
  'CAMPUS_RECRUITER',
  'FOUNDER',
  'FALLBACK',
]);

export type ContactArchetype = z.infer<typeof ContactArchetypeSchema>;

export const ContactPlatformSchema = z.enum(['LINKEDIN', 'EMAIL', 'GITHUB', 'TWITTER', 'OTHER']);

export type ContactPlatform = z.infer<typeof ContactPlatformSchema>;

export const ContactSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  name: z.string(),
  role: z.string().optional(),
  company: z.string(),
  archetype: ContactArchetypeSchema,
  evidenceUrls: z.array(z.string()).default([]),
  evidenceSnippets: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  linkedinUrl: z.string().optional(),
  email: z.string().optional(),
  platform: ContactPlatformSchema,
  foundVia: z.string(),
  createdAt: z.string(),
});

export type Contact = z.infer<typeof ContactSchema>;

export const ContactSearchResultSchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  company: z.string(),
  linkedinUrl: z.string().optional(),
  evidenceUrl: z.string(),
  evidenceSnippet: z.string().optional(),
  confidence: z.number().min(0).max(1),
  source: z.string(),
});

export type ContactSearchResult = z.infer<typeof ContactSearchResultSchema>;

export const ContactStrategySchema = z.object({
  targetArchetypes: z.array(ContactArchetypeSchema),
  searchQueries: z.array(z.string()),
  reasoning: z.string(),
});

export type ContactStrategy = z.infer<typeof ContactStrategySchema>;
