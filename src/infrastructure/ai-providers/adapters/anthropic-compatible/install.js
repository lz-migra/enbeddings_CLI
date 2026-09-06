/**
 * Interactive installer for the Anthropic-compatible adapter (LLM only).
 * Uses the Anthropic Messages API via an OpenAI-shaped proxy (e.g. MiniMax).
 */
import * as p from '@clack/prompts';

export async function install({ ask, confirm }) {
  p.log.step('Configure a chat endpoint that follows the Anthropic Messages API.');

  const model = await ask(
    'Model (e.g. claude-3-5-sonnet):',
    'claude-3-5-sonnet'
  );

  const baseUrl = await ask(
    'Base URL of the API (default: https://api.anthropic.com):',
    'https://api.anthropic.com'
  );

  const apiKey = await ask(
    'API key (env:VAR_NAME or literal value):',
    'env:ANTHROPIC_API_KEY'
  );

  const temperatureInput = await ask('Sampling temperature (0-1):', '0.2');
  const maxTokensInput = await ask('Max completion tokens:', '16000');
  const enableThinking = await confirm('Enable extended thinking?', false);

  const config = {
    model,
    base_url: baseUrl,
    api_key: apiKey,
    temperature: parseFloat(temperatureInput),
    max_tokens: parseInt(maxTokensInput, 10),
  };

  if (enableThinking) {
    const thinkingBudget = await ask('Thinking budget tokens:', '4096');
    config.thinking = true;
    config.thinking_budget_tokens = parseInt(thinkingBudget, 10);
  }

  p.log.success('Configuration completed successfully.');
  return config;
}
