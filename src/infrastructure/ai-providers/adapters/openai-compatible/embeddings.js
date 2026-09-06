/**
 * OpenAI-compatible embeddings provider.
 *
 * Uses the official `openai` SDK so it works against any endpoint that exposes
 * the OpenAI REST API:
 *   - OpenAI (api.openai.com)
 *   - NVIDIA NIM (via base_url override)
 *   - Groq, Together AI, OpenRouter, etc.
 *
 * The SDK is passed through the shared `ThrottledClient` for HTTP-level
 * concurrency control; we don't need its low-level retry helpers.
 */
import OpenAI from 'openai';
import { BaseEmbeddingsProvider } from '../../core/base-embeddings.js';
import { requireApiKey, validateObject } from '../../core/config-validation.js';

export function validateEmbeddingsConfig(config) {
  const errors = validateObject(config, {
    model: { required: true, type: 'string' },
  });
  requireApiKey(config, errors);
  return errors;
}

export class OpenAICompatibleEmbeddings extends BaseEmbeddingsProvider {
  /** @param {{ model: string, base_url?: string, api_key: string, dimensions?: number }} config */
  constructor(config, http) {
    super(config, http);
    this.client = new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url ?? 'https://api.openai.com/v1',
    });
  }

  async embedPassages(texts) {
    const res = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    return res.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  async embedQueries(texts) {
    return this.embedPassages(texts);
  }
}

/** Factory function used by the registry. */
export function createEmbeddingsClient(config, http) {
  return new OpenAICompatibleEmbeddings(config, http);
}
