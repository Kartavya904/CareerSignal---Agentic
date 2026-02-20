/**
 * Types for Browser agents
 */

import { z } from 'zod';

export const PageArtifactSchema = z.object({
  url: z.string(),
  html: z.string().optional(),
  screenshotPath: z.string().optional(),
  capturedAt: z.string(),
  pageTitle: z.string().optional(),
});

export type PageArtifact = z.infer<typeof PageArtifactSchema>;

export const RawJobListingSchema = z.object({
  title: z.string(),
  company: z.string().optional(),
  location: z.string().optional(),
  url: z.string().optional(),
  postedDate: z.string().optional(),
  salary: z.string().optional(),
  description: z.string().optional(),
  rawHtml: z.string().optional(),
  extractedFrom: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type RawJobListing = z.infer<typeof RawJobListingSchema>;

export const SourceValidationResultSchema = z.object({
  sourceId: z.string(),
  url: z.string(),
  isValid: z.boolean(),
  statusCode: z.number().optional(),
  errorMessage: z.string().optional(),
  suggestedUrl: z.string().optional(),
  hasJobListings: z.boolean().optional(),
  validatedAt: z.string(),
});

export type SourceValidationResult = z.infer<typeof SourceValidationResultSchema>;

export const PaginationInfoSchema = z.object({
  currentPage: z.number(),
  totalPages: z.number().optional(),
  hasNextPage: z.boolean(),
  nextPageUrl: z.string().optional(),
  nextPageSelector: z.string().optional(),
  loadMoreSelector: z.string().optional(),
});

export type PaginationInfo = z.infer<typeof PaginationInfoSchema>;

export const ExtractionStrategySchema = z.enum([
  'generic_heuristics',
  'site_specific',
  'json_ld',
  'microdata',
  'fallback_llm',
]);

export type ExtractionStrategy = z.infer<typeof ExtractionStrategySchema>;
