// filepath: src/infrastructure/ai-providers/adapters/openai-compatible/install.js
import * as p from '../../../../utils/secret-prompt.js';

function defaultEnvName(type) {
  return type === 'llm' ? 'OPENAI_COMPATIBLE_LLM_API_KEY' : 'OPENAI_COMPATIBLE_EMBEDDINGS_API_KEY';
}

export async function install({ ask, confirm, password, type, mode, envFile }) {
  const isLlm = type === 'llm';
  const isEmbeddings = type === 'embeddings';

  p.logStep(
    isLlm
      ? 'Configure an LLM endpoint that follows the OpenAI Chat Completions API.'
      : 'Configure an embeddings endpoint that follows the OpenAI Embeddings API.'
  );

  const envName = await ask(
    'Environment variable name for the API key:',
    defaultEnvName(type)
  );

  const apiKey = await password({
    message: `Value for ${envName} (hidden):`,
    validate: (value) => (value && value.trim().length > 0 ? undefined : 'Value is required'),
  });

  if (mode !== 'no-tui') {
    p.writeEnvFileSafe(envFile, { [envName]: apiKey });
    p.logSuccess(`Saved ${envName} to ${envFile} (mode 0600).`);
  }

  const model = await ask(
    isLlm
      ? 'LLM model (e.g. gpt-4o-mini):'
      : 'Embeddings model (e.g. text-embedding-3-small):',
    isLlm ? 'gpt-4o-mini' : 'text-embedding-3-small'
  );

  const baseUrl = await ask(
    'Base URL of the API (e.g. https://api.openai.com/v1):',
    'https://api.openai.com/v1'
  );

  const config = {
    model,
    base_url: baseUrl,
    api_key: `env:${envName}`,
  };

  if (isLlm) {
    const temperatureInput = await ask('Sampling temperature (0-1):', '0.2');
    const maxTokensInput = await ask('Max completion tokens:', '1000');
    config.temperature = parseFloat(temperatureInput);
    config.max_tokens = parseInt(maxTokensInput, 10);
  } else if (isEmbeddings) {
    const dimensionsInput = await ask('Vector dimensions:', '1536');
    config.dimensions = parseInt(dimensionsInput, 10);
  }

  p.logSuccess('Configuration completed successfully.');
  return config;
}

