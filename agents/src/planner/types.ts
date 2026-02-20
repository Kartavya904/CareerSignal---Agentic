/**
 * Types for Planner agents
 */

import { z } from 'zod';

export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  agent: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
  inputs: z.record(z.unknown()).optional(),
  outputs: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(WorkflowStepSchema),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WorkflowPlan = z.infer<typeof WorkflowPlanSchema>;

export const PolicyConstraintsSchema = z.object({
  maxPagesPerSource: z.number().default(10),
  maxJobsPerSource: z.number().default(100),
  maxTokensPerRun: z.number().default(50000),
  maxTimePerRunMs: z.number().default(600000), // 10 minutes
  rateLimitPerDomain: z.number().default(2), // requests per second
  allowedDomains: z.array(z.string()).optional(),
  blockedDomains: z.array(z.string()).optional(),
  simulationMode: z.boolean().default(false),
});

export type PolicyConstraints = z.infer<typeof PolicyConstraintsSchema>;

export const ScanConfigSchema = z.object({
  userId: z.string(),
  sourceIds: z.array(z.string()).optional(),
  includeContactHunt: z.boolean().default(true),
  includeDrafts: z.boolean().default(true),
  includeBlueprints: z.boolean().default(false),
  strictFilterEnabled: z.boolean().default(true),
  topK: z.number().default(15),
  constraints: PolicyConstraintsSchema.optional(),
});

export type ScanConfig = z.infer<typeof ScanConfigSchema>;
