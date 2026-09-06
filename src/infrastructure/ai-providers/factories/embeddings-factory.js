/**
 * Embeddings engine factory.
 *
 * The factory is intentionally tiny now: it looks up the provider in the
 * registry and wraps it with the shared `embedPassages` / `embedQueries`
 * adapter (this is the contract the indexer / query engine consume).
 *
 * To add a new embeddings provider:
 *   1. Create `adapters/<name>/embeddings.js` exporting `createEmbeddingsClient`.
 *   2. Register it in `core/index.js`.
 * That's it — no changes here.
 */
import { ThrottledClient } from '../core/http-client.js';
import { registry } from '../core/registry.js';
// Side-effect import: populates the registry with all built-in providers.
import '../core/index.js';

export function createEmbeddingsEngine(config) {
  const section = config.embeddings;
  const cfg = section?.config;
  if (!section?.provider) {
    throw new Error('Missing "provider" in embeddings config');
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw new Error(`Missing or invalid "config" for embeddings provider "${section.provider}"`);
  }

  const http = new ThrottledClient();
  const provider = registry.createEmbeddings(section.provider, cfg, http);

  return {
    model: provider.model,
    dimensions: provider.dimensions,
    embedPassages: (texts) => provider.embedPassages(texts),
    embedQueries: (texts) => provider.embedQueries(texts),
  };
}
