/**
 * Ollama HTTP client for local LLM inference.
 * Supports streaming and non-streaming completions.
 */

import {
  OLLAMA_BASE_URL,
  OllamaModels,
  type ModelConfig,
  defaultModelConfigs,
  type OllamaModelType,
} from './models.js';

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaClient {
  private baseUrl: string;
  private defaultTimeout: number;

  constructor(baseUrl: string = OLLAMA_BASE_URL, defaultTimeout: number = 300000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultTimeout = defaultTimeout; // 5 minutes default for LLM operations
  }

  /**
   * Generate completion using the /api/generate endpoint.
   */
  async generate(
    request: OllamaGenerateRequest,
    timeout?: number,
  ): Promise<OllamaGenerateResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout ?? this.defaultTimeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, stream: false }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama generate failed: ${response.status} - ${error}`);
      }

      return response.json() as Promise<OllamaGenerateResponse>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Chat completion using the /api/chat endpoint.
   */
  async chat(request: OllamaChatRequest, timeout?: number): Promise<OllamaChatResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout ?? this.defaultTimeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, stream: false }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama chat failed: ${response.status} - ${error}`);
      }

      return response.json() as Promise<OllamaChatResponse>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if Ollama is running and a model is available.
   */
  async isAvailable(model?: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return false;

      if (model) {
        const data = (await response.json()) as { models: Array<{ name: string }> };
        return data.models.some((m) => m.name === model || m.name.startsWith(model));
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * List available models.
   */
  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }
    const data = (await response.json()) as { models: Array<{ name: string }> };
    return data.models.map((m) => m.name);
  }

  /**
   * Generate embeddings for one or more texts using Ollama /api/embed.
   * Requires an embedding model (e.g. nomic-embed-text, mxbai-embed-large).
   */
  async embed(
    input: string | string[],
    options?: { model?: string; timeout?: number },
  ): Promise<number[][]> {
    const model = options?.model ?? process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
    const timeout = options?.timeout ?? 60000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama embed failed: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as { embeddings: number[][] };
      return data.embeddings ?? [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * High-level completion function with model type selection.
 */
export async function complete(
  prompt: string,
  modelType: OllamaModelType = 'GENERAL',
  options?: Partial<ModelConfig> & { system?: string; format?: 'json' },
): Promise<string> {
  const client = new OllamaClient();
  const config = { ...defaultModelConfigs[modelType], ...options };

  const messages: OllamaChatMessage[] = [];

  if (options?.system) {
    messages.push({ role: 'system', content: options.system });
  }

  messages.push({ role: 'user', content: prompt });

  const response = await client.chat(
    {
      model: config.model,
      messages,
      format: options?.format,
      options: {
        temperature: config.temperature,
        top_p: config.topP,
        num_predict: config.maxTokens,
      },
    },
    config.timeout,
  );

  return response.message.content;
}

/**
 * Complete with JSON output and validation.
 */
export async function completeJson<T>(
  prompt: string,
  modelType: OllamaModelType = 'GENERAL',
  options?: Partial<ModelConfig> & { system?: string },
): Promise<T> {
  const response = await complete(prompt, modelType, { ...options, format: 'json' });

  try {
    return JSON.parse(response) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${response.substring(0, 200)}...`);
  }
}

export const defaultClient = new OllamaClient();

/**
 * Generate embeddings for one or more texts (uses default Ollama client).
 */
export async function embed(
  input: string | string[],
  options?: { model?: string; timeout?: number },
): Promise<number[][]> {
  return defaultClient.embed(input, options);
}

/**
 * Embed many texts in batches to avoid overload. Returns embeddings in same order as inputs.
 */
export async function embedBatch(
  texts: string[],
  options?: { model?: string; timeout?: number; batchSize?: number },
): Promise<number[][]> {
  const batchSize = options?.batchSize ?? 10;
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await defaultClient.embed(batch, options);
    results.push(...embeddings);
  }
  return results;
}
