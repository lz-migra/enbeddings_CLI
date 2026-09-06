/**
 * Public entry point for the `anthropic-compatible` provider.
 *
 * - Chat uses the native Anthropic Messages API. Point `base_url` at the API
 *   root and pass `api_key` (for example, MiniMax's Anthropic-compatible API).
 * - Embeddings are NOT registered; calling them throws a clear error so users
 *   know to swap providers for that step.
 */
export { createEmbeddingsClient, AnthropicEmbeddings } from './embeddings.js';
export { createLlmClient, AnthropicCompatibleLlm, validateLlmConfig } from './chat.js';

export const name = 'anthropic-compatible';
