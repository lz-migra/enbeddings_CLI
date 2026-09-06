// filepath: src/infrastructure/ai-providers/adapters/nvidia-nim/install.js
import * as p from '../../../../utils/secret-prompt.js';

function defaultEnvName(type) {
  return type === 'llm' ? 'NVIDIA_NIM_LLM_API_KEY' : 'NVIDIA_NIM_EMBEDDINGS_API_KEY';
}

export async function install({ ask, confirm, password, type, mode, envFile }) {
  const isLlm = type === 'llm';
  const isEmbeddings = type === 'embeddings';

  p.logStep(
    isLlm
      ? 'Configure an LLM endpoint that follows the NVIDIA Chat Completions API.'
      : 'Configure an embeddings endpoint that follows the NVIDIA Embeddings API.'
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
      ? 'LLM model (e.g. meta/llama-3.1-70b-instruct):'
      : 'Embeddings model (e.g. nvidia/nemotron-3-embed-1b):',
    isLlm ? 'meta/llama-3.1-70b-instruct' : 'nvidia/nemotron-3-embed-1b'
  );

  const baseUrl = await ask(
    'Base URL (default: https://integrate.api.nvidia.com/v1):',
    'https://integrate.api.nvidia.com/v1'
  );

  const config = {
    model,
    base_url: baseUrl,
    api_key: `env:${envName}`,
  };

  if (isEmbeddings) {
    const dimensionsInput = await ask('Vector dimensions:', '2048');
    const indexingType = await ask('Input type for indexing (passage/query):', 'passage');
    const queryType = await ask('Input type for search (passage/query):', 'query');
    const truncate = await ask('Truncate mode (NONE/START/END) [Leave empty for NONE]:', '');
    const encodingFormat = await ask('Encoding format (float/base64) [Leave empty for float]:', '');

    config.dimensions = parseInt(dimensionsInput, 10);
    config.input_types = { indexing: indexingType, query: queryType };
    if (truncate && truncate !== 'NONE') config.truncate = truncate;
    if (encodingFormat && encodingFormat !== 'float') config.encoding_format = encodingFormat;
  } else if (isLlm) {
    const temperatureInput = await ask('Sampling temperature (0-1):', '0.2');
    const topPInput = await ask('Top-p sampling (0-1):', '0.95');
    const maxTokensInput = await ask('Max completion tokens:', '16384');
    const seedInput = await ask('Seed (numeric, blank for random):', '');
    const enableThinking = await confirm('Enable extended thinking?', false);

    config.temperature = parseFloat(temperatureInput);
    config.top_p = parseFloat(topPInput);
    config.max_tokens = parseInt(maxTokensInput, 10);

    if (seedInput && seedInput.trim() !== '' && !Number.isNaN(parseInt(seedInput, 10))) {
      config.seed = parseInt(seedInput, 10);
    }

    if (enableThinking) {
      const thinkingBudget = await ask('Thinking budget tokens:', '4096');
      config.chat_template_kwargs = {
        thinking: true,
        thinking_budget_tokens: parseInt(thinkingBudget, 10),
      };
    }
  }

  p.logSuccess('Configuration completed successfully.');
  return config;
}

