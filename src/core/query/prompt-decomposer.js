import { PROMPT_DECOMPOSITION_TIMEOUT_MS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';

const NOT_DECOMPOSABLE = 'NOT_DECOMPOSABLE';

const SYSTEM_PROMPT = `You are a query decomposition assistant for a code search engine.
First determine whether the user's request is a meaningful semantic search about
the indexed codebase. Casual conversation, greetings, direct commands, unrelated
requests, and prompts that do not seek information in the code are not searchable.
For those requests, return exactly: ${NOT_DECOMPOSABLE}
Otherwise, break the request down into exactly 3 targeted
search sub-queries that capture the true intent and different facets of the question.
Translate every sub-query to English, regardless of the language of the user's question.
Keep code identifiers, file names, API names, and provider/model names unchanged.
Return ONLY ${NOT_DECOMPOSABLE} or a JSON array of 3 strings, no markdown, no explanation.`;

/**
 * Decomposes a user prompt into 3 sub-queries via LLM.
 * Results are cached in-memory keyed by normalized prompt.
 */
export class PromptDecomposer {
  constructor(llmClient, { timeoutMs = PROMPT_DECOMPOSITION_TIMEOUT_MS } = {}) {
    this.llm = llmClient;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
  }

  async decompose(prompt) {
    const key = prompt.trim().toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let raw;
    try {
      raw = await this.llm.chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        { signal: controller.signal }
      );
    } catch (error) {
      const reason = error.name === 'AbortError' ? `timeout after ${this.timeoutMs} ms` : error.message;
      logger.warn(`Could not decompose the query (${reason}); the original query will be used.`);
      const fallback = [prompt];
      this.cache.set(key, fallback);
      return fallback;
    } finally {
      clearTimeout(timeout);
    }

    const normalizedRaw = String(raw ?? '').trim();
    if (normalizedRaw === NOT_DECOMPOSABLE) {
      const fallback = [prompt];
      this.cache.set(key, fallback);
      return fallback;
    }

    let queries;
    try {
      const cleaned = normalizedRaw.replace(/```(?:json)?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      queries = Array.isArray(parsed) ? parsed.slice(0, 3).map(String).filter(Boolean) : [prompt];
    } catch {
      queries = [prompt];
    }
    if (queries.length === 0) queries = [prompt];

    this.cache.set(key, queries);
    return queries;
  }
}
