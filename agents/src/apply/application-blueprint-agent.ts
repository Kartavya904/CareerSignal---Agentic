/**
 * Application Blueprint Agent - Maps application forms and creates fill plans
 *
 * Responsibilities:
 * - Navigate to apply URL
 * - Extract form structure
 * - Map form fields to profile fields
 * - Create checklist for user
 *
 * LLM Usage: Light (map ambiguous fields to profile fields)
 */

import { complete } from '@careersignal/llm';
import type { NormalizedJob } from '../normalize/types.js';
import type { ApplicationBlueprint, ApplicationStep, FormField, FormFieldType } from './types.js';
import { PROFILE_FIELDS } from './types.js';

export interface BlueprintResult {
  blueprint: ApplicationBlueprint;
  warnings: string[];
}

/**
 * Create application blueprint from job
 */
export async function createBlueprint(job: NormalizedJob): Promise<BlueprintResult> {
  const warnings: string[] = [];
  const applyUrl = job.applyUrl || job.sourceUrl;

  // Placeholder - actual implementation would navigate and extract form
  const steps: ApplicationStep[] = [
    {
      order: 1,
      description: 'Navigate to application page',
      url: applyUrl,
      fields: [],
      isComplete: false,
    },
    {
      order: 2,
      description: 'Fill out basic information',
      fields: getCommonFormFields(),
      isComplete: false,
    },
    {
      order: 3,
      description: 'Upload resume',
      fields: [
        {
          name: 'resume',
          label: 'Resume/CV',
          type: 'FILE',
          required: true,
          mappedProfileField: 'resume',
          mappingConfidence: 1.0,
        },
      ],
      isComplete: false,
    },
  ];

  const blueprint: ApplicationBlueprint = {
    id: `blueprint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    jobId: job.id,
    applyUrl,
    steps,
    requiredDocuments: ['resume'],
    blockers: [],
    atsType: detectAtsType(applyUrl),
    estimatedTime: '5-10 minutes',
    createdAt: new Date().toISOString(),
  };

  return { blueprint, warnings };
}

/**
 * Extract form structure from HTML
 */
export async function extractFormFromHtml(html: string, pageUrl: string): Promise<FormField[]> {
  // Use LLM to extract form fields from HTML
  const truncatedHtml = html.substring(0, 15000);

  const prompt = `Extract form fields from this application page HTML.

For each form field, extract:
- name: Field name/id
- label: Human-readable label
- type: TEXT, TEXTAREA, SELECT, FILE, CHECKBOX, RADIO, DATE, EMAIL, PHONE, URL, NUMBER
- required: true/false
- options: Array of options for SELECT/RADIO fields

Return JSON array: [{ name, label, type, required, options }, ...]

HTML:
${truncatedHtml}`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 2048,
      timeout: 60000,
    });

    const parsed = JSON.parse(response);
    const fields = Array.isArray(parsed) ? parsed : [];

    return fields.map((f: Record<string, unknown>) => ({
      name: String(f.name || ''),
      label: String(f.label || f.name || ''),
      type: (f.type as FormFieldType) || 'TEXT',
      required: Boolean(f.required),
      options: Array.isArray(f.options) ? f.options.map(String) : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Map form fields to profile fields
 */
export async function mapFieldsToProfile(fields: FormField[]): Promise<FormField[]> {
  const mappings: Record<string, string> = {
    // Exact matches
    first_name: 'firstName',
    firstname: 'firstName',
    last_name: 'lastName',
    lastname: 'lastName',
    email: 'email',
    phone: 'phone',
    phone_number: 'phone',
    resume: 'resume',
    cv: 'resume',
    cover_letter: 'coverLetter',
    linkedin: 'linkedinUrl',
    github: 'githubUrl',
    portfolio: 'portfolioUrl',
    website: 'portfolioUrl',
    salary: 'salary',
    expected_salary: 'salary',
    start_date: 'startDate',
    available_date: 'startDate',
    location: 'location',
    city: 'city',
    state: 'state',
    country: 'country',
    zip: 'zipCode',
    zipcode: 'zipCode',
    work_authorization: 'workAuthorization',
    visa_sponsorship: 'sponsorshipRequired',
    sponsorship: 'sponsorshipRequired',
  };

  return fields.map((field) => {
    const normalizedName = field.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const normalizedLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Try to match by name or label
    const mappedField = mappings[normalizedName] || mappings[normalizedLabel];

    if (mappedField) {
      return {
        ...field,
        mappedProfileField: mappedField,
        mappingConfidence: 0.9,
      };
    }

    // Try fuzzy matching
    for (const [key, value] of Object.entries(mappings)) {
      if (normalizedName.includes(key) || normalizedLabel.includes(key)) {
        return {
          ...field,
          mappedProfileField: value,
          mappingConfidence: 0.7,
        };
      }
    }

    return field;
  });
}

/**
 * Generate checklist from blueprint
 */
export function generateChecklist(blueprint: ApplicationBlueprint): string[] {
  const checklist: string[] = [];

  // Add required documents
  for (const doc of blueprint.requiredDocuments) {
    checklist.push(`☐ Prepare ${doc}`);
  }

  // Add steps
  for (const step of blueprint.steps) {
    checklist.push(`☐ ${step.description}`);

    // Add required fields
    for (const field of step.fields.filter((f) => f.required)) {
      checklist.push(`  ☐ Fill: ${field.label}`);
    }
  }

  // Add blockers as warnings
  for (const blocker of blueprint.blockers) {
    checklist.push(`⚠️ ${blocker}`);
  }

  return checklist;
}

function getCommonFormFields(): FormField[] {
  return [
    {
      name: 'firstName',
      label: 'First Name',
      type: 'TEXT',
      required: true,
      mappedProfileField: 'firstName',
      mappingConfidence: 1.0,
    },
    {
      name: 'lastName',
      label: 'Last Name',
      type: 'TEXT',
      required: true,
      mappedProfileField: 'lastName',
      mappingConfidence: 1.0,
    },
    {
      name: 'email',
      label: 'Email',
      type: 'EMAIL',
      required: true,
      mappedProfileField: 'email',
      mappingConfidence: 1.0,
    },
    {
      name: 'phone',
      label: 'Phone',
      type: 'PHONE',
      required: false,
      mappedProfileField: 'phone',
      mappingConfidence: 1.0,
    },
    {
      name: 'linkedin',
      label: 'LinkedIn URL',
      type: 'URL',
      required: false,
      mappedProfileField: 'linkedinUrl',
      mappingConfidence: 1.0,
    },
  ];
}

function detectAtsType(url: string): string | undefined {
  const atsPatterns: Record<string, string[]> = {
    Greenhouse: ['greenhouse.io', 'boards.greenhouse'],
    Lever: ['lever.co', 'jobs.lever'],
    Workday: ['workday.com', 'myworkday'],
    SmartRecruiters: ['smartrecruiters.com'],
    BambooHR: ['bamboohr.com'],
    Ashby: ['ashbyhq.com'],
    Taleo: ['taleo.net'],
    iCIMS: ['icims.com'],
    JazzHR: ['jazz.co'],
    Breezy: ['breezy.hr'],
  };

  const lowerUrl = url.toLowerCase();

  for (const [ats, patterns] of Object.entries(atsPatterns)) {
    if (patterns.some((p) => lowerUrl.includes(p))) {
      return ats;
    }
  }

  return undefined;
}
