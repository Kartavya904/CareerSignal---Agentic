/**
 * @careersignal/llm - Ollama client wrapper for local LLM inference
 */

export {
  OllamaModels,
  OLLAMA_BASE_URL,
  type OllamaModelType,
  type ModelConfig,
  defaultModelConfigs,
} from './models.js';

export {
  OllamaClient,
  complete,
  completeJson,
  defaultClient,
  embed,
  embedBatch,
  type OllamaGenerateRequest,
  type OllamaGenerateResponse,
  type OllamaChatMessage,
  type OllamaChatRequest,
  type OllamaChatResponse,
} from './client.js';

export {
  buildPrompt,
  createPromptTemplate,
  executeTemplate,
  jsonExtractionPrompt,
  structuredExtractionSystem,
  type PromptTemplate,
} from './prompts.js';

export {
  extractJson,
  parseJsonResponse,
  parseWithRetry,
  jsonFixers,
  defaultFixers,
  type ParseResult,
} from './parse.js';
