/**
 * JSON response parsing utilities with Zod validation.
 */

import { z, type ZodSchema, type ZodError } from 'zod';

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawResponse?: string;
}

/**
 * Extract JSON from a response that may contain markdown code blocks.
 */
export function extractJson(response: string): string {
  const trimmed = response.trim();

  // Try to extract from markdown code blocks
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  // Try to find JSON object or array
  const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1];
  }

  return trimmed;
}

/**
 * Parse and validate JSON response against a Zod schema.
 */
export function parseJsonResponse<T>(response: string, schema: ZodSchema<T>): ParseResult<T> {
  const rawResponse = response;

  try {
    const jsonStr = extractJson(response);
    const parsed = JSON.parse(jsonStr);
    const validated = schema.parse(parsed);

    return {
      success: true,
      data: validated,
      rawResponse,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: `Invalid JSON: ${error.message}`,
        rawResponse,
      };
    }

    if (error instanceof z.ZodError) {
      const issues = (error as ZodError).issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return {
        success: false,
        error: `Validation failed: ${issues}`,
        rawResponse,
      };
    }

    return {
      success: false,
      error: String(error),
      rawResponse,
    };
  }
}

/**
 * Parse JSON response with automatic retry logic for common issues.
 */
export function parseWithRetry<T>(
  response: string,
  schema: ZodSchema<T>,
  fixers?: Array<(input: string) => string>,
): ParseResult<T> {
  // First attempt
  let result = parseJsonResponse(response, schema);
  if (result.success) return result;

  // Apply fixers if provided
  if (fixers) {
    let fixed = response;
    for (const fixer of fixers) {
      fixed = fixer(fixed);
      result = parseJsonResponse(fixed, schema);
      if (result.success) return result;
    }
  }

  return result;
}

/**
 * Common JSON fixers for LLM output issues.
 */
export const jsonFixers = {
  /** Remove trailing commas in arrays/objects */
  removeTrailingCommas: (input: string): string => {
    return input.replace(/,\s*([}\]])/g, '$1');
  },

  /** Fix unquoted keys */
  quoteKeys: (input: string): string => {
    return input.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  },

  /** Replace single quotes with double quotes */
  fixQuotes: (input: string): string => {
    return input.replace(/'/g, '"');
  },

  /** Remove newlines within strings */
  fixNewlines: (input: string): string => {
    return input.replace(/[\r\n]+/g, ' ');
  },
};

/**
 * Default set of fixers to apply.
 */
export const defaultFixers = [
  jsonFixers.removeTrailingCommas,
  jsonFixers.quoteKeys,
  jsonFixers.fixQuotes,
];
