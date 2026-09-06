/**
 * Ollama embeddings provider (local).
 *
 * - No API key required.
 * - Uses Ollama's `/api/embed` (multimodal embeddings) which returns a flat
 *   array of vectors in the same order as inputs.
 * - Routed through the shared ThrottledClient for concurrency control +
 *   retries; the openai SDK is not used here because Ollama's endpoint shape
 *   diverges from OpenAI's.
 */
import { BaseEmbeddingsProvider } from '../../core/base-embeddings.js';
import { validateObject } from '../../core/config-validation.js';

export function validateEmbeddingsConfig(config) {
  return validateObject(config, {
    model: { required: true, type: 'string' },
  });
}

export class OllamaEmbeddings extends BaseEmbeddingsProvider {
  /** @param {{ model: string, base_url?: string }} config */
  constructor(config, http) {
    super(config, http);
    this.baseUrl = config.base_url ?? 'http://localhost:11434';
  }

  async #embed(texts) {
    const data = await this.http.request(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    return data.embeddings;
  }

  embedPassages(texts) {
    return this.#embed(texts);
  }

  embedQueries(texts) {
    return this.#embed(texts);
  }
}

/** Factory function used by the registry. */
export function createEmbeddingsClient(config, http) {
  return new OllamaEmbeddings(config, http);
}
