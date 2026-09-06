export const WORK_DIR = '.embeddings_service';
export const CONFIG_FILE = 'config.jsonc';
export const ENV_FILE = '.env';
export const DB_FILE = 'embeddings.db';
export const WATCHER_PID_FILE = 'watcher.pid';
export const WATCHER_LOCK_FILE = 'watcher.lock';
export const WATCHER_LOG_FILE = 'watcher.log';

export const DEFAULT_CONFIG = {
  version: '1.0',
  default_environment: 'global',
  watcher: {
    enabled: false,
    debounce_ms: 500,
    ignore_patterns: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/*.min.*',
      '**/.embeddings_service/**',
      '**/.obsidian/**',
    ],
  },
  database: {
    path: '~/.embeddings_service/embeddings.db',
  },
/*
  embeddings: {
    provider: 'openai-compatible',
    config: {
      model: 'example/llm-model',
      base_url: 'https://api.example.com/v1',
      api_key: 'env:EMB_API_KEY',
      dimensions: 1024,
      input_types: { indexing: 'passage', query: 'query' },
    },
  },
*/
/*
  llm: {
    provider: 'openai-compatible',
    config: {
      model: 'example/llm-model',
      base_url: 'https://api.example.com/v1',
      api_key: 'env:LLM_API_KEY',
      temperature: 0.2,
      max_tokens: 1000,
    },
  },
*/
  chunking: {
    max_chunk_size: 512,
    overlap: 50,
    supported_languages: ['typescript', 'javascript', 'python', 'go', 'rust'],
  },
};

export const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB
export const RRF_K = 60;
export const SUBQUERY_TOP_K = 20;
export const DEFAULT_LIMIT = 'auto';
export const AUTO_LIMIT_MAX = 8;
export const AUTO_MIN_SIMILARITY = 0.35;
export const AUTO_SCORE_DROP_RATIO = 0.7;
export const AUTO_SCORE_DROP_DELTA = 0.15;
export const PROMPT_DECOMPOSITION_TIMEOUT_MS = 15000;
export const HTTP_CONCURRENCY = 5;
export const HTTP_MAX_RETRIES = 5;
