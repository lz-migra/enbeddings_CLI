// filepath: src/infrastructure/ai-providers/adapters/anthropic-compatible/install.js
import * as p from '../../../../utils/secret-prompt.js';

function defaultEnvName() {
  return 'ANTHROPIC_COMPATIBLE_API_KEY';
}

export async function install({ ask, confirm, password, mode, envFile }) {
  p.logStep('Configure a chat endpoint that follows the Anthropic Messages API.');

  const envName = await ask(
    'Environment variable name for the API key:',
    defaultEnvName()
  );

  const apiKey = await password({
    message: `Value for ${envName} (hidden):`,
    validate: (value) => (value && value.trim().length > 0 ? undefined : 'Value is required'),
  });

  if (mode !== 'no-tui') {
    p.writeEnvFileSafe(envFile, { [envName]: apiKey });
    p.logSuccess(`Saved ${envName} to ${envFile} (mode 0600).`);
  }

  const model = await ask('Model (e.g. claude-3-5-sonnet):', 'claude-3-5-sonnet');
  const baseUrl = await ask(
    'Base URL of the API (default: https://api.anthropic.com):',
    'https://api.anthropic.com'
  );
  const temperatureInput = await ask('Sampling temperature (0-1):', '0.2');
  const maxTokensInput = await ask('Max completion tokens:', '16000');
  const enableThinking = await confirm('Enable extended thinking?', false);

  const config = {
    model,
    base_url: baseUrl,
    api_key: `env:${envName}`,
    temperature: parseFloat(temperatureInput),
    max_tokens: parseInt(maxTokensInput, 10),
  };

  if (enableThinking) {
    const thinkingBudget = await ask('Thinking budget tokens:', '4096');
    config.thinking = true;
    config.thinking_budget_tokens = parseInt(thinkingBudget, 10);
  }

  p.logSuccess('Configuration completed successfully.');
  return config;
}

