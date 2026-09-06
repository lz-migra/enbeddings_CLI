import { BaseEmbeddingsProvider } from '../../core/base-embeddings.js';
import { validateObject } from '../../core/config-validation.js';
import { CustomCommandRunner } from './command.js';

export function validateEmbeddingsConfig(config) {
  const errors = validateObject(config, {
    command: { required: true, type: 'string' },
    dimensions: { required: true, type: 'number' },
  });
  if (config?.timeout_ms !== undefined && (!Number.isInteger(config.timeout_ms) || config.timeout_ms <= 0)) {
    errors.push('timeout_ms must be a positive integer');
  }
  if (config?.output_filter_regex !== undefined && typeof config.output_filter_regex !== 'string') {
    errors.push('output_filter_regex must be a string');
  }
  return errors;
}

function parseVectors(raw, expectedCount) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Custom embeddings command must return JSON vectors: ${error.message}`);
  }
  const vectors = Array.isArray(parsed) ? parsed : parsed?.embeddings;
  if (!Array.isArray(vectors)) throw new Error('Custom embeddings output must be an array of vectors');
  const normalized = vectors.length > 0 && typeof vectors[0] === 'number' ? [vectors] : vectors;
  if (normalized.length !== expectedCount) {
    throw new Error(`Custom embeddings returned ${normalized.length} vectors for ${expectedCount} inputs`);
  }
  if (!normalized.every((vector) => Array.isArray(vector) && vector.every((value) => typeof value === 'number'))) {
    throw new Error('Custom embeddings output contains an invalid vector');
  }
  return normalized;
}

export class CustomCommandEmbeddings extends BaseEmbeddingsProvider {
  constructor(config, http) {
    super(config, http);
    this.runner = new CustomCommandRunner(config);
  }

  async #embed(texts) {
    const raw = await this.runner.run({
      input: JSON.stringify(texts),
      stdin: this.runner.useStdin ? JSON.stringify(texts) : null,
      model: this.model,
    });
    return parseVectors(raw, texts.length);
  }

  embedPassages(texts) {
    return this.#embed(texts);
  }

  embedQueries(texts) {
    return this.#embed(texts);
  }
}

export function createEmbeddingsClient(config, http) {
  return new CustomCommandEmbeddings(config, http);
}