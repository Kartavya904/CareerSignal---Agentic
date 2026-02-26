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
// Single-user V1: one row per account (email + password for sign up / sign in)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash'),
  name: varchar('name', { length: 255 }),
  admin: boolean('admin').default(false).notNull(),
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
  planSnapshot: jsonb('plan_snapshot').$type<unknown>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Per-user analysis from Application Assistant: job summary, match, resume tips, cover letters, etc. */
export const applicationAssistantAnalyses = pgTable('application_assistant_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  jobSummary: jsonb('job_summary').$type<Record<string, unknown>>(),
  matchScore: integer('match_score'),
  matchGrade: varchar('match_grade', { length: 8 }),
  matchBreakdown: jsonb('match_breakdown').$type<Record<string, unknown>>(),
  resumeSuggestions: jsonb('resume_suggestions').$type<Record<string, unknown>>(),
  coverLetters: jsonb('cover_letters').$type<Record<string, string>>(),
  contacts: jsonb('contacts').$type<Record<string, unknown>>(),
  keywordsToAdd: jsonb('keywords_to_add').$type<string[]>(),
  salaryLevelCheck: text('salary_level_check'),
  applicationChecklist: jsonb('application_checklist').$type<Record<string, unknown>[]>(),
  interviewPrepBullets: jsonb('interview_prep_bullets').$type<string[]>(),
  companyResearch: text('company_research'),
  runFolderName: varchar('run_folder_name', { length: 256 }),
  runStatus: varchar('run_status', { length: 16 }),
  currentStep: varchar('current_step', { length: 32 }),
  waitingForLogin: boolean('waiting_for_login').default(false),
  waitingForCaptcha: boolean('waiting_for_captcha').default(false),
  runUpdatedAt: timestamp('run_updated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Log lines for an Application Assistant run (persisted for live view and history). */
export const applicationAssistantAnalysisLogs = pgTable('application_assistant_analysis_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  analysisId: uuid('analysis_id')
    .notNull()
    .references(() => applicationAssistantAnalyses.id, { onDelete: 'cascade' }),
  ts: timestamp('ts').notNull(),
  agent: varchar('agent', { length: 64 }).notNull(),
  level: varchar('level', { length: 16 }).notNull(),
  message: text('message').notNull(),
  detail: text('detail'),
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

// ---------------------------------------------------------------------------
// API/ATS-first scraping: companies (entities) + canonical job_listings + job_observations
// ---------------------------------------------------------------------------

export const entityTypeEnum = pgEnum('entity_type', [
  'COMPANY',
  'SOURCE',
  'CONNECTOR_TEMPLATE',
  'RESOURCE',
]);
export const atsTypeEnum = pgEnum('ats_type', [
  'GREENHOUSE',
  'LEVER',
  'ASHBY',
  'SMARTRECRUITERS',
  'RECRUITEE',
  'PERSONIO',
  'WORKDAY',
  'UNKNOWN',
]);
export const scrapeStrategyEnum = pgEnum('scrape_strategy', [
  'AUTO',
  'API_JSON',
  'API_XML',
  'BROWSER_FALLBACK',
]);
export const scrapeStatusEnum = pgEnum('scrape_status', [
  'OK',
  'ERROR',
  'BLOCKED',
  'CAPTCHA',
  'LOGIN_WALL',
  'EMPTY',
  'SKIPPED',
]);
export const enrichmentStatusEnum = pgEnum('enrichment_status', [
  'PENDING',
  'RUNNING',
  'DONE',
  'ERROR',
]);
export const jobRemoteTypeEnum = pgEnum('job_remote_type', [
  'REMOTE',
  'HYBRID',
  'ONSITE',
  'UNKNOWN',
]);
export const jobStatusEnum = pgEnum('job_status', ['OPEN', 'CLOSED', 'UNKNOWN']);

/** Single table for companies, sources, connector templates, and resources. Type discriminator + optional parent_company_id. */
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: entityTypeEnum('type').notNull(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    url: text('url').notNull(),
    origin: text('origin'),
    kind: text('kind'),
    isPriorityTarget: boolean('is_priority_target').default(false).notNull(),
    enabledForScraping: boolean('enabled_for_scraping').default(false).notNull(),
    parentCompanyId: uuid('parent_company_id'), // self-FK added in migration (companies.id)
    atsType: atsTypeEnum('ats_type').default('UNKNOWN'),
    scrapeStrategy: scrapeStrategyEnum('scrape_strategy').default('AUTO'),
    connectorConfig: jsonb('connector_config').$type<Record<string, unknown>>(),
    lastFingerprintedAt: timestamp('last_fingerprinted_at'),
    lastScrapedAt: timestamp('last_scraped_at'),
    lastStatus: scrapeStatusEnum('last_status'),
    lastError: text('last_error'),
    scrapeIntervalMinutes: integer('scrape_interval_minutes'),
    schedulerEnabled: boolean('scheduler_enabled').default(false).notNull(),
    testBudget: jsonb('test_budget').$type<{
      max_pages?: number;
      max_jobs?: number;
      timeout_ms?: number;
    }>(),
    descriptionText: text('description_text'),
    enrichmentSources: jsonb('enrichment_sources').$type<{ urls?: string[]; paths?: string[] }>(),
    enrichmentStatus: enrichmentStatusEnum('enrichment_status').default('PENDING'),
    lastEnrichedAt: timestamp('last_enriched_at'),
    industries: jsonb('industries').$type<string[]>(),
    hqLocation: text('hq_location'),
    sizeRange: text('size_range'),
    foundedYear: integer('founded_year'),
    fundingStage: text('funding_stage'),
    publicCompany: boolean('public_company'),
    ticker: text('ticker'),
    remotePolicy: text('remote_policy'),
    sponsorshipSignals: jsonb('sponsorship_signals').$type<Record<string, unknown>>(),
    hiringLocations: jsonb('hiring_locations').$type<string[]>(),
    techStackHints: jsonb('tech_stack_hints').$type<string[]>(),
    websiteDomain: text('website_domain'),
    jobCountTotal: integer('job_count_total').default(0).notNull(),
    jobCountOpen: integer('job_count_open').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companiesTypeIdx: index('companies_type_idx').on(table.type),
    companiesPriorityIdx: index('companies_is_priority_target_idx').on(table.isPriorityTarget),
    companiesAtsTypeIdx: index('companies_ats_type_idx').on(table.atsType),
  }),
);

/** Canonical job cache: one row per real job posting, deduped by dedupe_key (normalized apply_url). */
export const jobListings = pgTable(
  'job_listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    location: text('location'),
    remoteType: jobRemoteTypeEnum('remote_type').default('UNKNOWN'),
    employmentType: text('employment_type'),
    level: text('level'),
    jobUrl: text('job_url'),
    applyUrl: text('apply_url'),
    externalId: text('external_id'),
    descriptionText: text('description_text'),
    descriptionHtml: text('description_html'),
    postedAt: timestamp('posted_at'),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    status: jobStatusEnum('status').default('OPEN'),
    dedupeKey: text('dedupe_key').notNull().unique(),
    rawExtract: jsonb('raw_extract').$type<Record<string, unknown>>(),
    evidencePaths: jsonb('evidence_paths').$type<string[]>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    jobListingsCompanyStatusIdx: index('job_listings_company_status_idx').on(
      table.companyId,
      table.status,
    ),
    jobListingsLastSeenIdx: index('job_listings_last_seen_idx').on(table.lastSeenAt),
  }),
);

/** Tracks which source(s) each job was observed from (multi-source provenance). */
export const jobObservations = pgTable(
  'job_observations',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobListings.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    observedUrl: text('observed_url'),
    observedAt: timestamp('observed_at').defaultNow().notNull(),
    contentHash: text('content_hash'),
  },
  (table) => ({
    jobObservationsJobSourceUnique: uniqueIndex('job_observations_job_source_unique').on(
      table.jobId,
      table.sourceId,
    ),
  }),
);
