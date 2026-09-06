/**
 * NVIDIA NIM embeddings provider.
 *
 * NVIDIA requires an explicit `input_type` per request:
 *   - "passage"  -> code chunks during indexing
 *   - "query"    -> user prompts during search
 *
 * The config can override these mappings via `input_types`, defaulting to the
 * values used by the official NVIDIA docs.
 *
 * Implementation note: NVIDIA's API is OpenAI-shaped but the SDK does not
 * expose `input_type` directly, so we hit the endpoint through our own thin
 * REST call wrapped by the shared ThrottledClient (concurrency + retries).
 * This keeps NVIDIA-specific behavior fully isolated from OpenAI's.
 */
import { BaseEmbeddingsProvider } from '../../core/base-embeddings.js';
import { requireApiKey, validateObject } from '../../core/config-validation.js';

export function validateEmbeddingsConfig(config) {
  const errors = validateObject(config, {
    model: { required: true, type: 'string' },
    dimensions: { required: true, type: 'number' },
  });
  requireApiKey(config, errors);
  return errors;
}

export class NvidiaNimEmbeddings extends BaseEmbeddingsProvider {
  /** @param {{ model: string, base_url?: string, api_key: string, dimensions?: number, input_types?: { indexing: string, query: string } }} config */
  constructor(config, http) {
    super(config, http);

    this.baseUrl = config.base_url ?? 'https://integrate.api.nvidia.com/v1';
    this.apiKey = config.api_key;
    this.inputTypes = config.input_types ?? { indexing: 'passage', query: 'query' };
  }

  async #embed(texts, inputType) {
    const data = await this.http.request(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: inputType,
        encoding_format: 'float',
      }),
    });
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  embedPassages(texts) {
    return this.#embed(texts, this.inputTypes.indexing);
  }

  embedQueries(texts) {
    return this.#embed(texts, this.inputTypes.query);
  }
}

/** Factory function used by the registry. */
export function createEmbeddingsClient(config, http) {
  return new NvidiaNimEmbeddings(config, http);
}
