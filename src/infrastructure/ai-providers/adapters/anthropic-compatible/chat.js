/**
 * Anthropic-compatible chat (LLM) provider.
 *
 * Uses the official Anthropic SDK and supports providers exposing the native
 * Anthropic Messages API, such as MiniMax.
 */
import Anthropic from '@anthropic-ai/sdk';
import { BaseLlmProvider } from '../../core/base-llm.js';
import { requireApiKey, validateObject } from '../../core/config-validation.js';

export function validateLlmConfig(config) {
  const errors = validateObject(config, {
    model: { required: true, type: 'string' },
  });
  requireApiKey(config, errors);
  return errors;
}

export class AnthropicCompatibleLlm extends BaseLlmProvider {
  /** @param {{ model: string, base_url?: string, api_key: string, temperature?: number, top_p?: number, max_tokens?: number, thinking?: boolean|object, thinking_budget_tokens?: number }} config */
  constructor(config, http) {
    super(config, http);

    this.client = new Anthropic({
      apiKey: config.api_key,
      baseURL: config.base_url ?? 'https://api.anthropic.com',
    });
  }

  async chat(messages, { temperature, maxTokens, signal } = {}) {
    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n');
    const conversation = messages
      .filter((message) => message.role !== 'system')
      .map(({ role, content }) => ({ role, content }));

    const request = {
      model: this.model,
      system: system || undefined,
      messages: conversation,
      temperature: temperature ?? this.config.temperature ?? 0.2,
      top_p: this.config.top_p,
      max_tokens: maxTokens ?? this.config.max_tokens ?? 1000,
    };

    if (this.config.thinking) {
      const thinkingBudget = this.config.thinking_budget_tokens ??
        Math.min(4096, Math.max(0, request.max_tokens - 1024));
      if (thinkingBudget > 0) {
        request.thinking =
          this.config.thinking === true
            ? { type: 'enabled', budget_tokens: thinkingBudget }
            : this.config.thinking;
      }
    }

    const response = await this.client.messages.create(request, { signal });
    const text = response.content
      ?.filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('') ?? '';
    if (!text.trim()) {
      const blockTypes = response.content?.map((block) => block.type).join(', ') || 'none';
      throw new Error(
        `Anthropic returned a response without text (stop_reason=${response.stop_reason ?? 'unknown'}; blocks=${blockTypes})`
      );
    }
    return text;
  }
}

/** Factory function used by the registry. */
export function createLlmClient(config, http) {
  return new AnthropicCompatibleLlm(config, http);
}
