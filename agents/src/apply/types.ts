/**
 * Types for Apply agents
 */

import { z } from 'zod';

export const FormFieldTypeSchema = z.enum([
  'TEXT',
  'TEXTAREA',
  'SELECT',
  'FILE',
  'CHECKBOX',
  'RADIO',
  'DATE',
  'EMAIL',
  'PHONE',
  'URL',
  'NUMBER',
  'UNKNOWN',
]);

export type FormFieldType = z.infer<typeof FormFieldTypeSchema>;

export const FormFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: FormFieldTypeSchema,
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  mappedProfileField: z.string().optional(),
  mappingConfidence: z.number().min(0).max(1).optional(),
  value: z.string().optional(),
});

export type FormField = z.infer<typeof FormFieldSchema>;

export const ApplicationStepSchema = z.object({
  order: z.number(),
  description: z.string(),
  url: z.string().optional(),
  screenshotRef: z.string().optional(),
  fields: z.array(FormFieldSchema).default([]),
  isComplete: z.boolean().default(false),
});

export type ApplicationStep = z.infer<typeof ApplicationStepSchema>;

export const ApplicationBlueprintSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  applyUrl: z.string(),
  steps: z.array(ApplicationStepSchema),
  requiredDocuments: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  atsType: z.string().optional(),
  estimatedTime: z.string().optional(),
  createdAt: z.string(),
});

export type ApplicationBlueprint = z.infer<typeof ApplicationBlueprintSchema>;

export const ProfileFieldMappingSchema = z.record(z.string());
export type ProfileFieldMapping = z.infer<typeof ProfileFieldMappingSchema>;

// Common profile field names for mapping
export const PROFILE_FIELDS = [
  'name',
  'firstName',
  'lastName',
  'email',
  'phone',
  'location',
  'city',
  'state',
  'country',
  'zipCode',
  'resume',
  'coverLetter',
  'linkedinUrl',
  'githubUrl',
  'portfolioUrl',
  'workAuthorization',
  'sponsorshipRequired',
  'salary',
  'startDate',
  'education',
  'experience',
  'skills',
] as const;
