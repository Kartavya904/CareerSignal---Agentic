import { z } from 'zod';

/** Structured target location: country required; state/city optional (no city without state). */
export const targetLocationSchema = z
  .object({
    country: z.string().min(1),
    state: z.string().optional(),
    city: z.string().optional(),
  })
  .refine((loc) => !loc.city || loc.state, { message: 'City requires state' });

export const strictFilterLevelSchema = z.enum(['STRICT', 'SEMI_STRICT', 'OFF']);
export const maxContactsPerJobSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
]);

const workAuthOptionSchema = z.enum(['US_CITIZEN', 'GREEN_CARD', 'H1B', 'OPT', 'EAD', 'OTHER']);
export const coverLetterLengthSchema = z.enum(['CONCISE', 'DEFAULT', 'DETAILED']);
export const coldMessageLengthSchema = z.enum(['VERY_SHORT', 'SHORT', 'MEDIUM']);

export const preferencesPutBodySchema = z
  .object({
    work_authorizations: z.array(workAuthOptionSchema).min(1, 'At least one work authorization'),
    // Locations + mobility
    target_locations: z.array(targetLocationSchema).default([]),
    willing_to_relocate: z.boolean().default(false),
    has_car: z.boolean().default(false),
    remote_preference: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'ANY']).default('ANY'),
    target_seniority: z.array(z.string()).default([]),
    target_roles: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    industries: z.array(z.string()).default([]),
    employment_types: z.array(z.string()).default([]),
    salary_min: z.number().nullable().optional(),
    salary_max: z.number().nullable().optional(),
    salary_currency: z.string().nullable().optional(),
    strict_filter_level: strictFilterLevelSchema.default('STRICT'),
    max_contacts_per_job: maxContactsPerJobSchema.default(2),
    email_updates_enabled: z.boolean().default(false),
    email_min_match_score: z.number().min(0).max(100).nullable().optional().default(60),
    outreach_tone: z.string().nullable().optional(),
    // Tone preferences: cover letter
    cover_letter_tone: z.array(z.string()).default([]),
    cover_letter_length: coverLetterLengthSchema.optional().default('DEFAULT'),
    cover_letter_word_choice: z.array(z.string()).default([]),
    cover_letter_notes: z.string().nullable().optional(),
    // Tone preferences: cold message (LinkedIn)
    cold_linkedin_tone: z.array(z.string()).default([]),
    cold_linkedin_length: coldMessageLengthSchema.optional().default('SHORT'),
    cold_linkedin_notes: z.string().nullable().optional(),
    // Tone preferences: cold email
    cold_email_tone: z.array(z.string()).default([]),
    cold_email_length: coldMessageLengthSchema.optional().default('SHORT'),
    cold_email_notes: z.string().nullable().optional(),
    target_contact_roles: z.array(z.string()).default(['HIRING_MANAGER', 'ENG_MANAGER', 'TEAM_LEAD', 'TECH_RECRUITER', 'CAMPUS_RECRUITER', 'FOUNDER']),
  })
  .strict();

export type PreferencesPutBody = z.infer<typeof preferencesPutBodySchema>;
export type TargetLocationInput = z.infer<typeof targetLocationSchema>;
