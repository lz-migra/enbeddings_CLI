/**
 * Anthropic-compatible embeddings provider.
 *
 * Anthropic does not currently ship a hosted embeddings model. This file is a
 * placeholder kept for symmetry: when Voyage / Anthropic embeddings land, the
 * class can be filled in without touching the registry or factories.
 *
 * For now, attempting to register this provider for embeddings raises so the
 * user gets a clear error instead of silently misbehaving.
 */
import { BaseEmbeddingsProvider } from '../../core/base-embeddings.js';

export class AnthropicEmbeddings extends BaseEmbeddingsProvider {
  constructor(config, http) {
    super(config, http);
    throw new Error(
      'Anthropic-compatible embeddings are not yet supported. ' +
        'Use another provider for embeddings.'
    );
  }
}

export function createEmbeddingsClient(config, http) {
  return new AnthropicEmbeddings(config, http);
}
