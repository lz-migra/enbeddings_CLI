# CLI Architecture and Project Structure

The CLI is designed to operate through API-like flows and modular components, structured as follows:

---

## 1. General Architecture & Configuration

* **Working Directory (`.embeddings_service`):** All configuration files and local vector databases are stored inside this directory:
* **Global:** Located in the user's home directory (`~/.embeddings_service/config.jsonc`). The CLI reads this by default as the base configuration.
* **Per-Project:** Located in the root of the repository (`./.embeddings_service/config.jsonc`). It contains only project-specific keys and overrides the global configuration.


* **JSON Configuration Structure:**
* **Global Configuration (`~/.embeddings_service/config.jsonc`):**
```json
{
  "version": "1.0",
  "default_environment": "global",
  "watcher": {
    "enabled": false,
    "debounce_ms": 500,
    "ignore_patterns": [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/*.min.*",
      "**/.embeddings_service/**",
      "**/.obsidian/**"
    ]
  },
  "database": {
    "path": "~/.embeddings_service/embeddings.db"
  },
  "embeddings": {
    "provider": "nvidia-nim",
    "config": {
      "model": "nvidia/nemotron-3-embed-1b",
      "base_url": "https://integrate.api.nvidia.com/v1",
      "api_key": "env:NVIDIA_NEMOTRON_3_EMBED_1B_API_KEY",
      "dimensions": 2048,
      "input_types": {
        "indexing": "passage",
        "query": "query"
      }
    }
  },
  "llm": {
    "provider": "openai-compatible",
    "config": {
      "model": "gpt-4o-mini",
      "base_url": "https://api.openai.com/v1",
      "api_key": "env:OPENAI_GPT_4O_MINI_API_KEY",
      "temperature": 0.2,
      "max_tokens": 1000
    }
  },
  "chunking": {
    "max_chunk_size": 512,
    "overlap": 50,
    "supported_languages": ["typescript", "javascript", "python", "go", "rust"]
  }
}

```


* **Per-Project Configuration (`./.embeddings_service/config.jsonc`):**
```json
{
  "watcher": {
    "enabled": true
  },
  "chunking": {
    "max_chunk_size": 256
  },
  "embeddings": {
    "provider": "openai-compatible",
    "config": {
      "model": "text-embedding-3-small",
      "api_key": "env:PROJECT_OPENAI_KEY"
    }
  }
}

```




* **SQLite Database Strategy (Global vs. Per-Project):**
* By default, the CLI looks for a local database at `./.embeddings_service/embeddings.db`. If this directory or file exists in the repository, the CLI interacts exclusively with the project database.
* If no local project database is found, it falls back to the global database located at `~/.embeddings_service/embeddings.db`.
* **Table Schema:** Simplified schema consisting of: `uuid` (unique chunk identifier), `hash` (file or chunk checksum for change tracking), `file_path` (file route), and `chunk` (code snippet and vector embedding).

* **Vector Search Strategy (`sqlite-vec`):** Vector similarity search is implemented using the [`sqlite-vec`](https://github.com/asg017/sqlite-vec) extension, which provides a native `vec0` virtual table for KNN queries inside SQLite — no external vector database required.
* **Schema:**
```sql
CREATE TABLE chunks (
  uuid TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,        -- SHA-256 of the whole file (change detection)
  start_line INTEGER,
  end_line INTEGER,
  content TEXT NOT NULL,
  model TEXT NOT NULL,            -- embedding model used (for compatibility checks)
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_chunks_file_path ON chunks(file_path);

CREATE VIRTUAL TABLE chunk_vectors USING vec0(
  uuid TEXT PRIMARY KEY,
  embedding FLOAT[1024]           -- dimension validated at startup against config
);
```
* **KNN Query:**
```sql
SELECT c.uuid, c.file_path, c.start_line, c.end_line, c.content, v.distance
FROM chunk_vectors v
JOIN chunks c ON c.uuid = v.uuid
WHERE v.embedding MATCH ? AND k = 20
ORDER BY v.distance;
```
* **Fallback:** If `sqlite-vec` cannot be loaded (unsupported platform), the CLI falls back to loading vectors into memory and computing cosine similarity in JS (acceptable up to ~50k chunks), emitting a performance warning.

* **Model / Dimension Versioning:** Because vectors from different models or dimensions are incompatible, the active model and dimensions are validated on every `search` and `index` run. If the configured model differs from the one stored in the database, the CLI aborts with a clear error and suggests `embeddings-service index --reindex --force` to rebuild the index.


* **Shared Embeddings Module with Task Intent Handling (`Input Types`):** A unified engine called across both indexing and query flows that adapts the request payload based on the task (required by NVIDIA NIM and Voyage AI):
* **Indexing Mode (`Passage / Document`):** Vectorizes code chunks specifying that the payload represents stored content.
* **Query Mode (`Query`):** Vectorizes user search prompts with query intent to optimize vector similarity retrieval in SQLite.


* **Provider Independence (Registry-Based):** The embedding generator and the query LLM operate independently and are plugged in through a central `ProviderRegistry`. Adding a new provider is a folder drop, not a code change in factories.
* **Adapter-owned configuration:** Each AI section contains `provider` and a free-form `config` object. The selected adapter validates that object before construction; the core does not assume provider-specific fields.
* **Modular Chunking Parsers:** `ChunkerEngine` maps extensions to independent parsers. Tree-sitter parsers load cached WASM grammars asynchronously, while HTML and CSS use `cheerio` and `postcss`. Every parser delegates final token packing and overlap to `BaseParser.packBlocks` / `splitByLines`.
* **Available providers:** `openai-compatible` (official `openai` SDK + `base_url`), `nvidia-nim` (NVIDIA-specific `input_type`), `ollama` (local, no key), `anthropic-compatible` (native Anthropic Messages API), and `custom-command` (external terminal command for LLM or embeddings).
* **Custom command protocol:** LLM commands receive prompt text and return text. Embeddings commands receive a JSON array of texts and return a JSON array of numeric vectors with matching length. `use_stdin`, `{prompt}`, `{input}`, `{model}`, `timeout_ms`, and `output_filter_regex` are adapter-specific settings.
* Mix freely (e.g. `nvidia-nim` for embeddings and `openai-compatible` for reasoning on a different base URL).

---

## 2. Initial Indexing Flow

* **Execution Modes (Manual vs. Automatic):**
* **On-demand (Manual):** Triggered explicitly via CLI commands to re-index an entire directory or a single file.
* **Safety guard:** Indexing and watching `/` or the user's home directory is rejected. Specific child directories must be selected explicitly.
* **Automatic Mode (Watcher):** A background process monitoring file system changes. It includes a toggle (on/off) configurable via command-line flags or JSON settings.
* **Watcher Process Model:**
* Implemented with `chokidar` and runs as a detached background process started via `embeddings-service watcher start`.
* State is tracked in `.embeddings_service/watcher.pid` (PID + start timestamp); `watcher stop` and `watcher status` read this file.
* Lifecycle and processing events are appended to `.embeddings_service/watcher.log` in the active project directory. Startup failures are recorded with timestamps and stack traces.
* **Single-instance lock:** a lock file (`.embeddings_service/watcher.lock`, via `proper-lockfile`) prevents two watchers from running on the same project. Stale locks (dead PID) are detected and cleaned automatically.
* If the process dies unexpectedly, the next CLI invocation detects the stale PID file and warns the user to restart the watcher.
* Changes are debounced (`watcher.debounce_ms`) and batched: multiple events on the same file within the window trigger a single re-index.


* **Change Control & Storage (Strategy A: File-Level Replacement):**
* The system computes a global checksum hash for the file. If the hash matches the stored value, indexing is skipped.
* When a watcher reports a rename as `unlink` plus `add`, the new file hash is matched against indexed files. Matching chunks are moved to the new path without calling the embeddings provider again.
* If the file has changed (e.g., a function was added, modified, or deleted):
1. **Purge:** Delete **all** existing records associated with that `file_path` in the active SQLite database:
```sql
DELETE FROM embeddings WHERE file_path = 'path/to/file.ext';

```


2. **Re-chunking:** Parse and segment the updated file. If code was removed, the new chunk list will strictly reflect the current code state.
3. **Insertion:** Generate new embeddings and insert updated routes, hashes, chunks, and vectors into SQLite.


* If a file is deleted from disk, the CLI executes only the purge query: `DELETE FROM embeddings WHERE file_path = '...'`.


* **AST-Aware Chunking:** Core segmentation engine driven by language-specific parsers to split code logically according to syntax boundaries.
* **Chunk Size Units:** `max_chunk_size` and `overlap` are measured in **tokens** (using the tokenizer of the configured embedding model, or `tiktoken` as a generic approximation), not characters.
* **File Filtering:** Binary files, files larger than 1 MB, minified files (long lines or low whitespace ratio), and files with embedded binary content (data URIs / Base64) are skipped during indexing. Detection uses extension allowlists, magic-byte sniffing, and content heuristics.

* **Rate Limiting & Resilience:** All embedding/LLM API calls go through a shared throttled client:
* Concurrency limit (default: 5 parallel requests) and request queue.
* Exponential backoff with jitter on HTTP 429 / 5xx (max 5 retries).
* Per-run progress reporting (`Indexed 120/340 files...`) and a summary of failed files at the end (failures never abort the whole run).

---

## 3. Query Flow

* **Query Processing:** Accepts the user's prompt and sends it to a reasoning LLM (using an OpenAI-compatible API interface).
* **Prompt Decomposition via System Prompt:** Employs a system prompt to analyze and break down the user's input into 3 targeted sub-queries capturing the true intent.
* **Optional & Cacheable:** Decomposition can be skipped with `--no-decompose` (the raw prompt is used as a single query, saving one LLM call and its latency). Decomposition results are cached in-memory keyed by normalized prompt for the duration of the process.
* **Vector Search:** Converts the 3 sub-queries into embeddings using **Query Mode (`query`)** and queries the active SQLite database (project or global) to retrieve matching context chunks.

* **Result Fusion (Reciprocal Rank Fusion):** Each sub-query retrieves its own top-K (K=20) chunk list. The lists are merged using **RRF**, which is robust across score scales and requires no tuning:
$$\text{RRF}(d) = \sum_{q \in Q} \frac{1}{k + \text{rank}_q(d)}, \quad k = 60$$
* Chunks appearing in multiple sub-query lists accumulate higher scores (natural deduplication by `uuid`).
* The final ranking is truncated to the top N results (default 5, configurable via `--limit`).
* The `similarity_score` shown in output is the cosine similarity of the best-matching sub-query, while ordering follows the RRF score.
* **Output Format Options:**
The CLI supports two output display modes depending on the execution context:
* **Terminal / Human Mode (Default):** Displays query decomposition progress in the console followed by relevant code chunks sorted by similarity score.
```bash
$ embeddings-service search "how does user authentication work in the system"

```


```text
🔍 Decomposing query...
 ├─ Q1: What user authentication methods are available?
 ├─ Q2: How are login credentials or tokens validated?
 └─ Q3: Where is the authentication middleware or service implemented?

🔎 Querying embeddings database (SQLite)...
Found 3 relevant chunks:

--------------------------------------------------------------------------------
1. src/services/auth.ts (Lines 12-45) | Similarity: 0.89
--------------------------------------------------------------------------------
export class AuthService {
  async login(credentials: LoginDto): Promise<AuthTokens> {
    const user = await this.userRepository.findByEmail(credentials.email);
    if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.tokenService.generateTokens(user.id);
  }
}

--------------------------------------------------------------------------------
2. src/middleware/authenticate.ts (Lines 5-28) | Similarity: 0.84
--------------------------------------------------------------------------------
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

```


* **Structured / Programmatic Mode (`--json`):** Returns a clean JSON payload for external scripts or tool integrations.
```bash
$ embeddings-service search "how does user authentication work" --json

```


```json
{
  "query_original": "how does user authentication work in the system",
  "generated_queries": [
    "What user authentication methods are available?",
    "How are login credentials or tokens validated?",
    "Where is the authentication middleware or service implemented?"
  ],
  "total_results": 2,
  "results": [
    {
      "uuid": "c56a8d10-8b1e-4509-9061-efc8f12a3211",
      "file_path": "src/services/auth.ts",
      "similarity_score": 0.89,
      "chunk": "export class AuthService {\n  async login(credentials: LoginDto)..."
    },
    {
      "uuid": "f89d31a2-11bc-4e2b-bb2a-718290a129ef",
      "file_path": "src/middleware/authenticate.ts",
      "similarity_score": 0.84,
      "chunk": "export const authenticateToken = (req: Request, res: Response)..."
    }
  ]
}

```





---

## 4. Node.js Project Structure

To maintain clean separation of concerns and extensibility (following a simplified Clean / Hexagonal Architecture pattern), the codebase is organized as follows:

```text
embeddings-service-cli/
├── bin/
│   └── cli.js                  # Executable entrypoint (#!/usr/bin/env node)
│
├── src/
│   ├── commands/               # CLI command controllers (Commander / Yargs)
│   │   ├── init.js             # Initializes .embeddings_service/config.jsonc
│   │   ├── install.js          # Interactive global configuration setup
│   │   ├── index.js            # Manual re-indexing command
│   │   ├── search.js           # Query / search command
│   │   └── watcher.js          # Automatic watcher control (start/stop/status)
│   │
│   ├── config/                 # Configuration management & merging
│   │   ├── config-loader.js    # Merges global (~/) and local (./) configs
│   │   └── constants.js        # System constants & default values
│   │
│   ├── core/                   # Core business logic (Domain layer)
│   │   ├── indexer/            # Indexing flow orchestrator
│   │   │   ├── indexer.js
│   │   │   └── watcher-service.js
│   │   │
│   │   ├── query/              # Query flow orchestrator
│   │   │   ├── query-engine.js
│   │   │   └── prompt-decomposer.js # 3-question prompt decomposition via LLM
│   │   │
│   │   └── chunking/           # Code segmentation engine
│   │       ├── chunker-engine.js # Core chunking engine
│   │       └── parsers/
│   │           ├── base-parser.js
│   │           ├── typescript-parser.js
│   │           ├── python-parser.js
│   │           └── generic-parser.js
│   │
│   ├── infrastructure/         # External adapters & drivers
│   │   ├── database/           # SQLite persistence layer
│   │   │   ├── sqlite-client.js
│   │   │   └── repositories/
│   │   │       └── embeddings-repository.js # Implements Strategy A (DELETE/INSERT)
│   │   │
│   │   └── ai-providers/       # AI provider integrations (registry-based)
│   │       ├── core/                      # Shared contracts + registry
│   │       │   ├── base-embeddings.js     # Abstract embeddings interface
│   │       │   ├── base-llm.js            # Abstract LLM interface
│   │       │   ├── registry.js            # ProviderRegistry (dynamic lookup)
│   │       │   ├── index.js               # Registers the built-in providers
│   │       │   └── http-client.js         # Shared HTTP client (concurrency + retries)
│   │       ├── factories/                 # Factories that consult the registry
│   │       │   ├── embeddings-factory.js
│   │       │   └── llm-factory.js
│   │       ├── adapters/                  # Each provider isolated in its own folder
│   │       │   ├── openai-compatible/     # openai SDK + base_url (OpenAI, Groq, etc.)
│   │       │   │   ├── embeddings.js
│   │       │   │   ├── chat.js
│   │       │   │   └── index.js
│   │       │   ├── nvidia-nim/            # NVIDIA NIM with input_type, no inheritance
│   │       │   │   ├── embeddings.js
│   │       │   │   ├── chat.js
│   │       │   │   └── index.js
│   │       │   ├── ollama/                # Local, no API key
│   │       │   │   ├── embeddings.js
│   │       │   │   ├── chat.js
│   │       │   │   └── index.js
│   │       │   ├── anthropic-compatible/  # LLM-only via OpenAI-shaped proxy
│   │       │       ├── embeddings.js      # Stub (throws a clear error)
│   │       │       ├── chat.js
│   │       │       └── index.js
│   │       │   └── custom-command/        # External terminal command adapter
│   │       │       ├── command.js
│   │       │       ├── embeddings.js
│   │       │       ├── chat.js
│   │       │       └── index.js
│   │
│   └── utils/                  # Utility functions & helpers
│       ├── hash.js             # Checksum computing (SHA-256)
│       ├── logger.js           # Formatted console logging
│       └── file-system.js      # Path resolution for .embeddings_service
│
├── .embeddings_service/        # Local development workspace configuration
│   ├── config.jsonc
│   ├── embeddings.db
│   └── watcher.log
│
├── tests/                      # Test suite
│   ├── unit/
│   └── integration/
│
├── .gitignore
├── package.json
└── README.md

```