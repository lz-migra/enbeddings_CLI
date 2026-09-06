/**
 * Interactive installer for the Ollama adapter.
 * Prompts differ slightly for embeddings vs LLM.
 */
import * as p from '@clack/prompts';

export async function install({ ask, type }) {
  const isLlm = type === 'llm';

  p.log.step(
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

  p.log.success('Configuration completed successfully.');

  return { model, base_url: baseUrl };
}
