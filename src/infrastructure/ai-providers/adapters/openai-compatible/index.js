/**
 * Public entry point for the `openai-compatible` provider.
 *
 * Exposes:
 *   - createEmbeddingsClient(config, http): embeddings adapter
 *   - createLlmClient(config, http):         chat adapter
 *
 * Both reuse the official `openai` SDK and just point it at `base_url`.
 */
export { createEmbeddingsClient, OpenAICompatibleEmbeddings, validateEmbeddingsConfig, } from './embeddings.js';
export { createLlmClient, OpenAICompatibleLlm, validateLlmConfig } from './chat.js';

export const name = 'openai-compatible';
