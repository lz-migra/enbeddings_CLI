/**
 * Interactive installer for the OpenAI-compatible adapter.
 * Adjusts prompts based on whether it's configuring embeddings or LLM.
 */
import * as p from '@clack/prompts';

export async function install({ ask, type }) {
  const isLlm = type === 'llm';
  const isEmbeddings = type === 'embeddings';

  p.log.step(
    isLlm
      ? 'Configure an LLM endpoint that follows the OpenAI Chat Completions API.'
      : 'Configure an embeddings endpoint that follows the OpenAI Embeddings API.'
  );

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

  const apiKey = await ask(
    'API key (env:VAR_NAME or literal value):',
    'env:OPENAI_API_KEY'
  );

  const config = { model, base_url: baseUrl, api_key: apiKey };

  if (isLlm) {
    const temperatureInput = await ask('Sampling temperature (0-1):', '0.2');
    const maxTokensInput = await ask('Max completion tokens:', '1000');
    config.temperature = parseFloat(temperatureInput);
    config.max_tokens = parseInt(maxTokensInput, 10);
  } else if (isEmbeddings) {
    const dimensionsInput = await ask('Vector dimensions:', '1536');
    config.dimensions = parseInt(dimensionsInput, 10);
  }

  p.log.success('Configuration completed successfully.');
  return config;
}
