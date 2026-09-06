/**
 * Provider registry: single source of truth for which providers exist and how
 * to instantiate them. New providers register themselves; the factories only
 * consult the registry.
 *
 * Adding a new provider = create a folder under ./adapters/<name>/ with an
 * index.js exporting its factory and validation function, then register it in
 * index.js (see bottom of file).
 */
export class ProviderRegistry {
  constructor() {
    /** @type {Map<string, (config:any, http:any) => import('./base-embeddings.js').BaseEmbeddingsProvider>} */
    this.embeddings = new Map();
    /** @type {Map<string, (config:any, http:any) => import('./base-llm.js').BaseLlmProvider>} */
    this.llm = new Map();
  }

  registerEmbeddings(name, factory, validateConfig = () => []) {
    if (this.embeddings.has(name)) {
      throw new Error(`Embeddings provider "${name}" already registered`);
    }
    this.embeddings.set(name, { factory, validateConfig });
  }

  registerLlm(name, factory, validateConfig = () => []) {
    if (this.llm.has(name)) {
      throw new Error(`LLM provider "${name}" already registered`);
    }
    this.llm.set(name, { factory, validateConfig });
  }

  #validate(definition, config, kind, name) {
    const errors = definition.validateConfig(config) ?? [];
    if (errors.length > 0) {
      throw new Error(
        `Invalid configuration for ${kind} provider "${name}":\n- ${errors.join('\n- ')}`
      );
    }
  }

  createEmbeddings(name, config, http) {
    const definition = this.embeddings.get(name);
    if (!definition) {
      throw new Error(
        `Unknown embeddings provider "${name}". Available: ${[...this.embeddings.keys()].join(', ')}`
      );
    }
    this.#validate(definition, config, 'embeddings', name);
    return definition.factory(config, http);
  }

  createLlm(name, config, http) {
    const definition = this.llm.get(name);
    if (!definition) {
      throw new Error(
        `Unknown LLM provider "${name}". Available: ${[...this.llm.keys()].join(', ')}`
      );
    }
    this.#validate(definition, config, 'LLM', name);
    return definition.factory(config, http);
  }

  listEmbeddings() {
    return [...this.embeddings.keys()];
  }

  listLlm() {
    return [...this.llm.keys()];
  }
}

/** Singleton — import this everywhere. */
export const registry = new ProviderRegistry();
