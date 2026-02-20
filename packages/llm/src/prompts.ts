/**
 * Prompt template utilities for consistent LLM interactions.
 */

export interface PromptTemplate {
  system?: string;
  template: string;
  variables: string[];
}

/**
 * Build a prompt by substituting variables into a template.
 */
export function buildPrompt(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Create a reusable prompt template.
 */
export function createPromptTemplate(
  template: string,
  options?: { system?: string },
): PromptTemplate {
  const variableRegex = /\{(\w+)\}/g;
  const variables: string[] = [];
  let match;
  while ((match = variableRegex.exec(template)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return {
    system: options?.system,
    template,
    variables,
  };
}

/**
 * Execute a prompt template with given variables.
 */
export function executeTemplate(
  template: PromptTemplate,
  variables: Record<string, string>,
): { prompt: string; system?: string } {
  const missingVars = template.variables.filter((v) => !(v in variables));
  if (missingVars.length > 0) {
    throw new Error(`Missing template variables: ${missingVars.join(', ')}`);
  }

  return {
    prompt: buildPrompt(template.template, variables),
    system: template.system,
  };
}

/**
 * Wrap content in JSON extraction instructions.
 */
export function jsonExtractionPrompt(
  content: string,
  schema: string,
  instructions?: string,
): string {
  return `${instructions ? instructions + '\n\n' : ''}Extract the following information from the content below and return it as valid JSON matching this schema:

Schema:
${schema}

Content:
${content}

Return ONLY valid JSON. Do not include any explanation or markdown formatting.`;
}

/**
 * Create a structured extraction system prompt.
 */
export function structuredExtractionSystem(taskDescription: string): string {
  return `You are a precise data extraction assistant. Your task is to ${taskDescription}.

Rules:
1. Extract information exactly as it appears in the source
2. Return valid JSON matching the requested schema
3. Use null for missing optional fields
4. Do not make up or infer information that isn't present
5. Preserve original formatting for text content`;
}
