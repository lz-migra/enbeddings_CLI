/**
 * Public entry point for the `nvidia-nim` provider.
 *
 * - Embeddings use NVIDIA's own `/embeddings` endpoint with `input_type`
 *   because the official openai SDK does not expose this field.
 * - Chat uses the openai SDK pointed at NVIDIA's `base_url`.
 *
 * If you want to swap providers but keep an "openai-compatible" call shape,
 * use the `openai-compatible` provider instead.
 */
export { createEmbeddingsClient, NvidiaNimEmbeddings, validateEmbeddingsConfig } from './embeddings.js';
export { createLlmClient, NvidiaNimLlm, validateLlmConfig } from './chat.js';

export const name = 'nvidia-nim';
