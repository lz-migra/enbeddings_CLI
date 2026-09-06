/**
 * Public entry point for the `ollama` provider.
 * - Embeddings: hits Ollama's native `/api/embed`.
 * - Chat: reuses the openai SDK against `/v1/chat/completions`.
 */
export { createEmbeddingsClient, OllamaEmbeddings, validateEmbeddingsConfig } from './embeddings.js';
export { createLlmClient, OllamaLlm, validateLlmConfig } from './chat.js';

export const name = 'ollama';
