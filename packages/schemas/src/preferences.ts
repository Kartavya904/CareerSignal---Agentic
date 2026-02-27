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

export const preferencesPutBodySchema = z
  .object({
    work_authorization: z.enum(['US_CITIZEN', 'GREEN_CARD', 'H1B', 'OPT', 'EAD', 'OTHER']),
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
    outreach_tone: z.string().nullable().optional(),
  })
  .strict();

export type PreferencesPutBody = z.infer<typeof preferencesPutBodySchema>;
export type TargetLocationInput = z.infer<typeof targetLocationSchema>;
