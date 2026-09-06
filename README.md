# embeddings-service-cli

CLI for semantic code search: indexes your codebase into a local SQLite database
(using [sqlite-vec](https://github.com/asg017/sqlite-vec)) and answers natural
language queries via embeddings + LLM query decomposition.

## Install

```bash
npm install
npm link   # exposes the `embeddings-service` command
```

## Quick start

```bash
embeddings-service install              # global setup with interactive prompts
embeddings-service init --adapter nvidia-nim  # project-local setup with adapter
export NVIDIA_NEMOTRON_3_EMBED_1B_API_KEY=...
embeddings-service index                # index the current project
embeddings-service search "how does user authentication work"
embeddings-service search "auth flow" --json --limit 3
embeddings-service watcher start        # background auto re-indexing
```

## Commands

| Command | Description |
|---|---|
| `init [--global] [--adapter <name>]` | Create config file (project or `~/.embeddings_service`) with optional interactive adapter setup |
| `install [--adapter <name>]` | Configure the global `~/.embeddings_service/config.jsonc` interactively |
| `index [path] [--reindex] [--force]` | Index the project, a directory, or a single file |
| `search <prompt> [--json] [--no-decompose] [-l N\|auto]` | Semantic search with dynamic or explicit result limit |
| `watcher start/stop/status` | Manage the background file watcher |

Indexing and watching the filesystem root (`/`) or the user home directory are
blocked as a safety measure. Run the command from a specific project directory,
or provide a project path explicitly, such as `embeddings-service index ./my-project`.

The watcher writes an append-only log to `.embeddings_service/watcher.log` in
the active project directory. The log records startup, shutdown, file changes,
and initialization errors. Use `watcher start --foreground` when diagnosing a
startup problem interactively; background failures are also recorded in this
log.

## Configuration

Global config lives at `~/.embeddings_service/config.jsonc`; a project-level
`./.embeddings_service/config.jsonc` overrides it (deep merge). Each model
configuration has its own `api_key`, using an `env:VAR_NAME` reference, so
embeddings and LLMs can use different keys even when they use the same provider.
See `architecture_cli.md` for the full schema.

Each AI section contains only the provider name and an adapter-owned `config`
object. The adapter validates that object before it is constructed:

```json
{
   "embeddings": {
      "provider": "nvidia-nim",
      "config": {
         "model": "nvidia/nemotron-3-embed-1b",
         "base_url": "https://integrate.api.nvidia.com/v1",
         "api_key": "env:EMB_API_KEY",
         "dimensions": 2048,
         "input_types": { "indexing": "passage", "query": "query" }
      }
   },
   "llm": {
      "provider": "anthropic-compatible",
      "config": {
         "model": "MiniMax-M3",
         "base_url": "https://api.minimax.io/anthropic",
         "api_key": "env:LLM_API_KEY",
         "max_tokens": 16000
      }
   }
}
```

Invalid adapter configuration fails before any network request with a list of
missing or incorrectly typed fields.

### Custom command adapter

`custom-command` delegates work to an external command. With `use_stdin: true`,
the LLM receives its prompt as plain text on stdin. Embeddings receive a JSON
array of texts and must return a JSON array of numeric vectors. The command may
also use `{prompt}`, `{input}`, or `{model}` placeholders in its command string.

Example LLM configuration:

```json
{
   "llm": {
      "provider": "custom-command",
      "config": {
         "command": "opencode run",
         "model": "local-model",
         "timeout_ms": 10000,
         "use_stdin": true,
         "output_filter_regex": "(?:```json\\s*)?(\\[[\\s\\S]*?\\])(?:\\s*```)?"
      }
   }
}
```

Example embeddings configuration:

```json
{
   "embeddings": {
      "provider": "custom-command",
      "config": {
         "command": "./scripts/embed.sh",
         "dimensions": 768,
         "timeout_ms": 30000,
         "use_stdin": true
      }
   }
}
```

The embeddings command receives `["text one", "text two"]` and must return
`[[0.1, 0.2], [0.3, 0.4]]` with the same number of vectors as inputs.

## Architecture

- **Strategy A change control**: file hash check → purge → re-chunk → embed → insert. Renames reuse existing chunks by hash and update only their file path, avoiding duplicate embedding calls.
- **AST-aware chunking** (TypeScript/Python parsers + generic fallback), token-bounded with overlap.
- **File filtering**: skips binary files, files > 1 MB, minified files (long lines or low whitespace), and files with embedded binary content (data URIs / Base64).
- **Query flow**: LLM decomposes the prompt into 3 sub-queries → KNN per sub-query → Reciprocal Rank Fusion.
- **Provider independence**: mix NVIDIA/OpenAI/Ollama for embeddings and LLM.

## Providers

Provider names identify the API **family**, not the service. Every provider
sits in its own folder under `src/infrastructure/ai-providers/adapters/` and
registers itself with the central `ProviderRegistry`.

| Provider | Embeddings | LLM | Notes |
|---|---|---|---|
| `openai-compatible` | ✅ | ✅ | Official `openai` SDK + `base_url` override. Works with OpenAI, Groq, Together, OpenRouter, etc. |
| `nvidia-nim` | ✅ | ✅ | Uses NVIDIA's `input_type` (passage/query). Self-contained — no OpenAI inheritance. |
| `ollama` | ✅ | ✅ | Local. No API key. Native `/api/embed` + OpenAI-shaped `/v1/chat`. |
| `anthropic-compatible` | ❌ (throws) | ✅ | Native Anthropic Messages API via the official SDK. Compatible with MiniMax. Embeddings not supported yet. |
| `custom-command` | ✅ | ✅ | Runs an external terminal command or subprocess. LLM output is text; embeddings output JSON vectors. |

Mix them freely: e.g. `nvidia-nim` for embeddings and `openai-compatible` for
the LLM, each with its own model-specific API key.

Search uses `--limit auto` by default. Automatic mode filters low-similarity
chunks, stops at an abrupt score drop, and never returns more than eight
results. Use `--limit 3` or `-l 3` for an exact numeric limit.

Before decomposition, the LLM checks whether the request is relevant to code
search. Casual or unrelated requests use the original query directly. Prompt
decomposition has a 15-second timeout; provider errors and timeouts also fall
back to the original query so SQLite search can continue.

### Interactive setup

The `install` and `init --adapter <name>` commands run an interactive installer
that prompts for the fields each adapter needs. Each adapter owns its own
installer in `src/infrastructure/ai-providers/adapters/<name>/install.js`,
which receives an `ask(question, default)` function and returns a
configuration object that is merged into the AI section.

Available installers:

| Adapter | Fields prompted |
|---|---|
| `openai-compatible` | model, base_url, api_key, temperature, max_tokens |
| `nvidia-nim` | model, base_url, api_key, dimensions, indexing/query input types |
| `ollama` | model, base_url |
| `anthropic-compatible` | model, base_url, api_key, temperature, max_tokens, optional thinking budget |
| `custom-command` | command, timeout_ms, use_stdin, optional output_filter_regex |

Global install example:

```bash
embeddings-service install --adapter nvidia-nim
Configuring nvidia-nim...
Model (e.g. nvidia/nemotron-3-embed-1b): [nvidia/nemotron-3-embed-1b]:
Base URL: [https://integrate.api.nvidia.com/v1]:
API key (env:VAR or literal): [env:NVIDIA_API_KEY]: env:EMB_API_KEY
Dimensions: [2048]:
Indexing input type: [passage]:
Query input type: [query]:
✔ Created /home/user/.embeddings_service/config.jsonc
```

The `install` command writes the global `~/.embeddings_service/config.jsonc`
with an absolute database path so the same configuration works from any
project. The `init --adapter <name>` command runs the same installer but
writes the project-local `./.embeddings_service/config.jsonc`.

### Adding a new provider

1. Create `src/infrastructure/ai-providers/adapters/<name>/` with
   `embeddings.js`, `chat.js`, `index.js`, and an optional `install.js` for the
   interactive installer.
2. Register them in `src/infrastructure/ai-providers/core/index.js`.
3. If you added `install.js`, expose it from `index.js` so `install` and
   `init --adapter <name>` can discover it automatically.

The installer contract is:

```js
// adapters/<name>/install.js
export async function install({ ask }) {
  const model = await ask('Model:', 'default-model');
  const baseUrl = await ask('Base URL:', 'https://api.example.com/v1');
  return { model, base_url: baseUrl };
}
```

That's it — factories, registry, and commands don't change.

### Chunking parsers

Code parsers use `web-tree-sitter` with WASM grammars from `tree-sitter-wasm`.
HTML uses `cheerio`, and CSS uses `postcss`. Each parser emits logical blocks
with source line ranges; `BaseParser.packBlocks` and `splitByLines` remain the
single place responsible for token limits and overlap. If a grammar cannot be
loaded or the source is invalid, code parsers fall back to the generic line
parser. New parsers can be registered with `registerParser(['.ext'], Parser)`
from `src/core/chunking/chunker-engine.js`.
