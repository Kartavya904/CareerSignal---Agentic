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
  integer,
  uniqueIndex,
  index,
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
  'ENTRY',
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
export const strictFilterLevelEnum = pgEnum('strict_filter_level', [
  'STRICT',
  'SEMI_STRICT',
  'OFF',
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
  'PAUSED',
]);
export const scrapeStatusEnum = pgEnum('last_scrape_status', ['SUCCESS', 'FAILED', 'PARTIAL']);

// Single-user V1: one row per account (email + password for sign up / sign in)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash'),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Structured target location: country required; state/city optional (no city without state). */
export type TargetLocationRow = {
  country: string;
  state?: string;
  city?: string;
};

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
  highlightedSkills: jsonb('highlighted_skills').$type<string[]>().default([]),
  suggestedSkills: jsonb('suggested_skills').$type<string[]>().default([]),
  experience: jsonb('experience').$type<unknown[]>().default([]),
  education: jsonb('education').$type<unknown[]>().default([]),
  projects: jsonb('projects').$type<unknown[]>().default([]),
  certifications: jsonb('certifications').$type<string[]>().default([]),
  industries: jsonb('industries').$type<string[]>().default([]),
  languages: jsonb('languages').$type<string[]>().default([]),
  salaryRange: jsonb('salary_range').$type<{ min: number; max: number; currency: string }>(),
  employmentType: jsonb('employment_type').$type<string[]>().default([]),
  remotePreference: remotePreferenceEnum('remote_preference'),
  linkedinUrl: varchar('linkedin_url', { length: 512 }),
  githubUrl: varchar('github_url', { length: 512 }),
  portfolioUrl: varchar('portfolio_url', { length: 512 }),
  resumeRawText: text('resume_raw_text'),
  resumeFileRef: varchar('resume_file_ref', { length: 512 }),
  resumeParsedAt: timestamp('resume_parsed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** One row per user; used for scoring and preferences UI. */
export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  workAuthorization: workAuthorizationEnum('work_authorization').notNull(),
  targetLocations: jsonb('target_locations').$type<TargetLocationRow[]>().default([]),
  remotePreference: remotePreferenceEnum('remote_preference').notNull().default('ANY'),
  targetSeniority: jsonb('target_seniority').$type<string[]>().default([]),
  targetRoles: jsonb('target_roles').$type<string[]>().default([]),
  skills: jsonb('skills').$type<string[]>().default([]),
  industries: jsonb('industries').$type<string[]>().default([]),
  employmentTypes: jsonb('employment_types').$type<string[]>().default([]),
  salaryMin: decimal('salary_min', { precision: 12, scale: 2 }),
  salaryMax: decimal('salary_max', { precision: 12, scale: 2 }),
  salaryCurrency: varchar('salary_currency', { length: 8 }),
  strictFilterLevel: strictFilterLevelEnum('strict_filter_level').notNull().default('STRICT'),
  maxContactsPerJob: integer('max_contacts_per_job').notNull().default(2),
  outreachTone: varchar('outreach_tone', { length: 64 }).default('PROFESSIONAL_CONCISE'),
  syncedFromProfileAt: timestamp('synced_from_profile_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** One row per user: timestamps for resume upload, parse, insights, and profile edits. */
export const userMetadata = pgTable('user_metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  resumeUploadedAt: timestamp('resume_uploaded_at'),
  resumeParsedAt: timestamp('resume_parsed_at'),
  insightsGeneratedAt: timestamp('insights_generated_at'),
  profileUpdatedAt: timestamp('profile_updated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Cached AI insights per user (years, seniority, scores 0–100, rating). */
export const userProfileInsights = pgTable('user_profile_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  totalYearsExperience: integer('total_years_experience').notNull().default(0),
  seniority: varchar('seniority', { length: 32 }).notNull().default('Unknown'),
  keywordDepth: integer('keyword_depth').notNull().default(0),
  strengthScore: integer('strength_score').notNull().default(0),
  overallScore: integer('overall_score').notNull().default(0),
  resumeRating: text('resume_rating'),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Backend-owned sources we scrape on a schedule; cache is shared. Not tied to any user. */
export const blessedSources = pgTable('blessed_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  url: text('url').notNull(),
  type: sourceTypeEnum('type').notNull(),
  slug: varchar('slug', { length: 64 }),
  enabledForScraping: boolean('enabled_for_scraping').default(true).notNull(),
  scrapeIntervalMinutes: integer('scrape_interval_minutes'),
  lastScrapedAt: timestamp('last_scraped_at'),
  lastScrapeStatus: scrapeStatusEnum('last_scrape_status'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Shared cache of job listings per blessed source; one stable row per listing (upsert by dedupe_key). */
export const jobListingsCache = pgTable(
  'job_listings_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blessedSourceId: uuid('blessed_source_id')
      .notNull()
      .references(() => blessedSources.id, { onDelete: 'cascade' }),
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
    dedupeKey: varchar('dedupe_key', { length: 256 }).notNull(),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    jobListingsCacheBlessedDedupeIdx: uniqueIndex('job_listings_cache_blessed_dedupe_idx').on(
      table.blessedSourceId,
      table.dedupeKey,
    ),
    jobListingsCacheBlessedLastSeenIdx: index('job_listings_cache_blessed_last_seen_idx').on(
      table.blessedSourceId,
      table.lastSeenAt,
    ),
  }),
);

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
  blessedSourceId: uuid('blessed_source_id').references(() => blessedSources.id, {
    onDelete: 'set null',
  }),
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
  planSnapshot: jsonb('plan_snapshot').$type<unknown>(),
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
  jobListingCacheId: uuid('job_listing_cache_id').references(() => jobListingsCache.id, {
    onDelete: 'set null',
  }),
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
