/**
 * Interface contract for LLM (chat completion) providers.
 *
 * Adapter-specific configuration is validated by the registry before the
 * adapter is constructed. Every provider MUST expose:
 *   - model: (string) model identifier
 *   - chat(messages, opts): run a chat completion, return text content
 *
 * The factory wires `opts = { temperature, maxTokens }` from config defaults.
 * Providers may accept additional options (streaming, tools, etc.) but must
 * not require them.
 */
export class BaseLlmProvider {
  constructor(config, http) {
    this.config = config;
    this.http = http;
    this.model = config?.model;
  }

  /** Throws unless overridden by the concrete provider. */
  async chat(_messages, _opts = {}) {
    throw new Error('chat() must be implemented by the provider');
  }
}
