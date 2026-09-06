/**
 * LLM client factory.
 *
 * Builds an LLM adapter backed by the provider registered under
 * `config.llm.provider`. Defaults for `temperature` and `maxTokens` come from
 * the config section; the caller may override per-call.
 *
 * To add a new LLM provider:
 *   1. Create `adapters/<name>/chat.js` exporting `createLlmClient`.
 *   2. Register it in `core/index.js`.
 */
import { ThrottledClient } from '../core/http-client.js';
import { registry } from '../core/registry.js';
// Side-effect import: populates the registry with all built-in providers.
import '../core/index.js';

export function createLlmClient(config) {
  const section = config.llm;
  const cfg = section?.config;
  if (!section?.provider) {
    throw new Error('Missing "provider" in llm config');
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw new Error(`Missing or invalid "config" for LLM provider "${section.provider}"`);
  }

  const http = new ThrottledClient();
  const provider = registry.createLlm(section.provider, cfg, http);

  return {
    model: provider.model,
    chat: (messages, opts = {}) => provider.chat(messages, opts),
  };
}
