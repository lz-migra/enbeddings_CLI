// filepath: src/infrastructure/ai-providers/adapters/ollama/install.js
import * as p from '../../../../utils/secret-prompt.js';

export async function install({ ask, type }) {
  const isLlm = type === 'llm';

  p.logStep(
    isLlm
      ? 'Configure a local Ollama Chat endpoint (OpenAI-compatible on /v1/chat/completions).'
      : 'Configure a local Ollama Embeddings endpoint (native /api/embed).'
  );

  const model = await ask(
    isLlm
      ? 'LLM model (e.g. llama3):'
      : 'Embeddings model (e.g. nomic-embed-text):',
    isLlm ? 'llama3' : 'nomic-embed-text'
  );

  const baseUrl = await ask(
    'Base URL of your Ollama server:',
    'http://localhost:11434'
  );

  p.logSuccess('Configuration completed successfully.');

  return { model, base_url: baseUrl };
}

