/**
 * Ollama model configuration loaded from environment variables.
 * All models run locally via Ollama - no external API costs.
 */

export const OllamaModels = {
  /** Deep reasoning model for complex tasks (scoring, planning) */
  REASONING: process.env.OLLAMA_MODEL_REASONING ?? 'deepseek-r1:32b-qwen-distill-q4_K_M',

  /** General purpose model for structured extraction (resume parsing, normalization) */
  GENERAL: process.env.OLLAMA_MODEL_GENERAL ?? 'qwen2.5:32b-instruct-q4_K_M',

  /** Code generation model for dynamic selectors */
  CODE: process.env.OLLAMA_MODEL_CODE ?? 'qwen2.5-coder:32b-instruct-q4_K_M',

  /** Fast model for high-volume tasks (8B params, ~2s/response) */
  FAST: process.env.OLLAMA_MODEL_FAST ?? 'llama3.1:8b-instruct-q4_K_M',
  /** Long-context fallback model for oversized inputs (configured but not yet used) */
  LONG_CONTEXT: process.env.OLLAMA_MODEL_LONG_CONTEXT ?? 'qwen2.5:72b-instruct-q4_K_M',
} as const;

export type OllamaModelType = keyof typeof OllamaModels;

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

export interface ModelConfig {
  model: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  timeout?: number;
}

export const defaultModelConfigs: Record<OllamaModelType, ModelConfig> = {
  REASONING: {
    model: OllamaModels.REASONING,
    temperature: 0.1,
    maxTokens: 4096,
    timeout: 300000, // 5 minutes for deep reasoning
  },
  GENERAL: {
    model: OllamaModels.GENERAL,
    temperature: 0.1,
    maxTokens: 8192,
    timeout: 300000, // cap at 5 minutes
  },
  CODE: {
    model: OllamaModels.CODE,
    temperature: 0.1,
    maxTokens: 2048,
    timeout: 180000, // up to 3 minutes for code helpers
  },
  FAST: {
    model: OllamaModels.FAST,
    temperature: 0.2,
    maxTokens: 8192,
    timeout: 180000, // up to 3 minutes for fast tasks
  },
  LONG_CONTEXT: {
    model: OllamaModels.LONG_CONTEXT,
    temperature: 0.1,
    maxTokens: 32768,
    timeout: 300000, // up to 5 minutes for long-context fallbacks
  },
};
