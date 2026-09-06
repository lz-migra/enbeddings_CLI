/**
 * Ollama chat (LLM) provider (local).
 *
 * Ollama exposes an OpenAI-compatible /v1/chat/completions endpoint, so we
 * reuse the official openai SDK pointed at `http://localhost:11434/v1`. No
 * API key needed; the SDK accepts any string.
 */
import OpenAI from 'openai';
import { BaseLlmProvider } from '../../core/base-llm.js';
import { validateObject } from '../../core/config-validation.js';

export function validateLlmConfig(config) {
  return validateObject(config, {
    model: { required: true, type: 'string' },
  });
}

export class OllamaLlm extends BaseLlmProvider {
  /** @param {{ model: string, base_url?: string, temperature?: number, max_tokens?: number }} config */
  constructor(config, http) {
    super(config, http);
    this.client = new OpenAI({
      apiKey: config.api_key ?? 'ollama',
      baseURL: config.base_url ?? 'http://localhost:11434/v1',
    });
  }

  async chat(messages, { temperature, maxTokens } = {}) {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: temperature ?? this.config.temperature ?? 0.2,
      max_tokens: maxTokens ?? this.config.max_tokens ?? 1000,
    });
    return res.choices?.[0]?.message?.content ?? '';
  }
}

/** Factory function used by the registry. */
export function createLlmClient(config, http) {
  return new OllamaLlm(config, http);
}
