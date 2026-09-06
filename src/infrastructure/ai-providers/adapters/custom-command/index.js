/**
 * Adapter for external terminal commands and subprocesses.
 *
 * LLM commands receive a text prompt. Embeddings commands receive a JSON array
 * of input texts and must return a JSON array of numeric vectors.
 */
export { createEmbeddingsClient, CustomCommandEmbeddings, validateEmbeddingsConfig } from './embeddings.js';
export { createLlmClient, CustomCommandLlm, validateLlmConfig } from './chat.js';

export const name = 'custom-command';