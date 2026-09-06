/**
 * Interface contract for embeddings providers.
 *
 * Adapter-specific configuration is validated by the registry before the
 * adapter is constructed. Every provider MUST expose:
 *   - model:        (string)  model identifier
 *   - dimensions:   (number)  vector size
 *   - embedPassages(texts): embed code chunks (input type = passage/document)
 *   - embedQueries(texts):  embed search prompts  (input type = query)
 *
 * The factory uses these four members to build the unified `embeddingsEngine`
 * consumed by the indexer and query engine. Providers are free to add
 * additional helpers, but must satisfy the contract above.
 */
export class BaseEmbeddingsProvider {
  constructor(config, http) {
    this.config = config;
    this.http = http;
    this.model = config?.model;
    this.dimensions = config?.dimensions;
  }

  /** Throws unless overridden by the concrete provider. */
  async embedPassages(_texts) {
    throw new Error('embedPassages() must be implemented by the provider');
  }

  /** Throws unless overridden by the concrete provider. */
  async embedQueries(_texts) {
    throw new Error('embedQueries() must be implemented by the provider');
  }
}
