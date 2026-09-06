/**
 * NVIDIA NIM chat (LLM) provider.
 *
 * NVIDIA exposes an OpenAI-compatible /chat/completions endpoint, so we reuse
 * the official openai SDK but point it at NVIDIA's `base_url`. No inheritance
 * — this file is self-contained.
 */
import OpenAI from 'openai';
import { BaseLlmProvider } from '../../core/base-llm.js';
import { requireApiKey, validateObject } from '../../core/config-validation.js';

export function validateLlmConfig(config) {
  const errors = validateObject(config, {
    model: { required: true, type: 'string' },
  });
  requireApiKey(config, errors);
  return errors;
}

export class NvidiaNimLlm extends BaseLlmProvider {
  /** @param {{ model: string, base_url?: string, api_key: string, temperature?: number, max_tokens?: number }} config */
  constructor(config, http) {
    super(config, http);

    this.client = new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url ?? 'https://integrate.api.nvidia.com/v1',
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
  return new NvidiaNimLlm(config, http);
}
