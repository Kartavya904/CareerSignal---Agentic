import { z } from 'zod';

export const workAuthorizationEnum = z.enum([
  'US_CITIZEN',
  'GREEN_CARD',
  'H1B',
  'OPT',
  'EAD',
  'OTHER',
]);
export type WorkAuthorization = z.infer<typeof workAuthorizationEnum>;

export const seniorityEnum = z.enum([
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
export type Seniority = z.infer<typeof seniorityEnum>;

export const employmentTypeEnum = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'UNKNOWN',
]);
export type EmploymentType = z.infer<typeof employmentTypeEnum>;

export const remotePreferenceEnum = z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'ANY']);
export type RemotePreference = z.infer<typeof remotePreferenceEnum>;

export const sourceTypeEnum = z.enum(['COMPANY', 'AGGREGATOR', 'COMMUNITY', 'CUSTOM']);
export type SourceType = z.infer<typeof sourceTypeEnum>;

export const sourceStatusEnum = z.enum(['ACTIVE', 'BROKEN', 'VALIDATING', 'DISABLED']);
export type SourceStatus = z.infer<typeof sourceStatusEnum>;

export const runStatusEnum = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export type RunStatus = z.infer<typeof runStatusEnum>;

export const visaSponsorshipEnum = z.enum(['YES', 'NO', 'UNKNOWN']);
export type VisaSponsorship = z.infer<typeof visaSponsorshipEnum>;
