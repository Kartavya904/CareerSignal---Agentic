import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  decimal,
  date,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Enums (storage)
export const workAuthorizationEnum = pgEnum('work_authorization', [
  'US_CITIZEN',
  'GREEN_CARD',
  'H1B',
  'OPT',
  'EAD',
  'OTHER',
]);
export const seniorityEnum = pgEnum('seniority', [
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
export const employmentTypeEnum = pgEnum('employment_type', [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'UNKNOWN',
]);
export const remotePreferenceEnum = pgEnum('remote_preference', [
  'REMOTE',
  'HYBRID',
  'ONSITE',
  'ANY',
]);
export const sourceTypeEnum = pgEnum('source_type', [
  'COMPANY',
  'AGGREGATOR',
  'COMMUNITY',
  'CUSTOM',
]);
export const sourceStatusEnum = pgEnum('source_status', [
  'ACTIVE',
  'BROKEN',
  'VALIDATING',
  'DISABLED',
]);
export const runStatusEnum = pgEnum('run_status', [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

// Single-user V1: one row per account (email + password for sign up / sign in)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash'),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 64 }),
  location: varchar('location', { length: 255 }).notNull(),
  workAuthorization: workAuthorizationEnum('work_authorization').notNull(),
  seniority: seniorityEnum('seniority'),
  targetRoles: jsonb('target_roles').$type<string[]>().default([]),
  skills: jsonb('skills').$type<string[]>().default([]),
  experience: jsonb('experience').$type<unknown[]>().default([]),
  education: jsonb('education').$type<unknown[]>().default([]),
  certifications: jsonb('certifications').$type<string[]>().default([]),
  industries: jsonb('industries').$type<string[]>().default([]),
  salaryRange: jsonb('salary_range').$type<{ min: number; max: number; currency: string }>(),
  employmentType: jsonb('employment_type').$type<string[]>().default([]),
  remotePreference: remotePreferenceEnum('remote_preference'),
  resumeRawText: text('resume_raw_text'),
  resumeFileRef: varchar('resume_file_ref', { length: 512 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  url: text('url').notNull(),
  type: sourceTypeEnum('type').notNull().default('CUSTOM'),
  enabled: boolean('enabled').default(true).notNull(),
  isBlessed: boolean('is_blessed').default(false).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  lastScannedAt: timestamp('last_scanned_at'),
  lastValidatedAt: timestamp('last_validated_at'),
  status: sourceStatusEnum('status').notNull().default('ACTIVE'),
  correctedUrl: text('corrected_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: runStatusEnum('status').notNull().default('PENDING'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  sourceIds: jsonb('source_ids').$type<string[]>().default([]),
  events: jsonb('events').$type<unknown[]>(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Jobs table for when extraction is implemented
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'set null' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 512 }).notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  sourceUrl: text('source_url').notNull(),
  location: varchar('location', { length: 255 }),
  remoteType: varchar('remote_type', { length: 32 }),
  seniority: seniorityEnum('seniority'),
  employmentType: employmentTypeEnum('employment_type'),
  visaSponsorship: varchar('visa_sponsorship', { length: 16 }),
  description: text('description'),
  requirements: jsonb('requirements').$type<string[]>(),
  postedDate: date('posted_date'),
  salaryMin: decimal('salary_min', { precision: 12, scale: 2 }),
  salaryMax: decimal('salary_max', { precision: 12, scale: 2 }),
  salaryCurrency: varchar('salary_currency', { length: 8 }),
  department: varchar('department', { length: 255 }),
  team: varchar('team', { length: 255 }),
  applyUrl: text('apply_url'),
  rawExtract: jsonb('raw_extract').$type<Record<string, unknown>>(),
  evidenceRefs: jsonb('evidence_refs').$type<string[]>(),
  confidence: decimal('confidence', { precision: 3, scale: 2 }),
  dedupeKey: varchar('dedupe_key', { length: 64 }),
  matchScore: decimal('match_score', { precision: 5, scale: 2 }),
  scoreBreakdown: jsonb('score_breakdown').$type<Record<string, unknown>>(),
  scoreExplanation: text('score_explanation'),
  strictFilterPass: boolean('strict_filter_pass'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
