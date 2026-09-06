/**
 * Barrel for the provider core: register all built-in providers here.
 * Importing this file for its side effects is enough to fully populate the
 * registry.
 */
export { BaseEmbeddingsProvider } from './base-embeddings.js';
export { BaseLlmProvider } from './base-llm.js';
export { ProviderRegistry, registry } from './registry.js';
export { validateObject, requireApiKey } from './config-validation.js';

import { registry } from './registry.js';
import { createEmbeddingsClient as oaiEmb, createLlmClient as oaiLlm, validateEmbeddingsConfig as validateOaiEmb, validateLlmConfig as validateOaiLlm } from '../adapters/openai-compatible/index.js';
import { createEmbeddingsClient as nvidiaEmb, createLlmClient as nvidiaLlm, validateEmbeddingsConfig as validateNvidiaEmb, validateLlmConfig as validateNvidiaLlm } from '../adapters/nvidia-nim/index.js';
import { createEmbeddingsClient as ollamaEmb, createLlmClient as ollamaLlm, validateEmbeddingsConfig as validateOllamaEmb, validateLlmConfig as validateOllamaLlm } from '../adapters/ollama/index.js';
import { createLlmClient as anthropicLlm, validateLlmConfig as validateAnthropicLlm } from '../adapters/anthropic-compatible/index.js';
import { createEmbeddingsClient as customEmb, createLlmClient as customLlm, validateEmbeddingsConfig as validateCustomEmb, validateLlmConfig as validateCustomLlm } from '../adapters/custom-command/index.js';

// Register each provider. Different providers MAY share a name across
// embeddings/llm (e.g. "nvidia-nim" exists as both), or exist for only one
// (e.g. "anthropic-compatible" is LLM-only today).
registry.registerEmbeddings('openai-compatible', oaiEmb, validateOaiEmb);
registry.registerLlm('openai-compatible', oaiLlm, validateOaiLlm);

registry.registerEmbeddings('nvidia-nim', nvidiaEmb, validateNvidiaEmb);
registry.registerLlm('nvidia-nim', nvidiaLlm, validateNvidiaLlm);

registry.registerEmbeddings('ollama', ollamaEmb, validateOllamaEmb);
registry.registerLlm('ollama', ollamaLlm, validateOllamaLlm);

registry.registerLlm('anthropic-compatible', anthropicLlm, validateAnthropicLlm);

registry.registerEmbeddings('custom-command', customEmb, validateCustomEmb);
registry.registerLlm('custom-command', customLlm, validateCustomLlm);
