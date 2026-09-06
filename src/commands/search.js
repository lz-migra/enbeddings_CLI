import { Command } from 'commander';
import { loadConfig } from '../config/config-loader.js';
import { openDatabase } from '../infrastructure/database/sqlite-client.js';
import { EmbeddingsRepository } from '../infrastructure/database/repositories/embeddings-repository.js';
import { createEmbeddingsEngine } from '../infrastructure/ai-providers/factories/embeddings-factory.js';
import { createLlmClient } from '../infrastructure/ai-providers/factories/llm-factory.js';
import { PromptDecomposer } from '../core/query/prompt-decomposer.js';
import { QueryEngine } from '../core/query/query-engine.js';
import { configuredDbPath } from '../utils/file-system.js';
import { logger } from '../utils/logger.js';

export function searchCommand() {
  return new Command('search')
    .description('Semantic search over the indexed codebase')
    .argument('<prompt>', 'Natural language query')
    .option('--json', 'Output structured JSON for programmatic use')
    .option('--no-decompose', 'Skip LLM query decomposition (use raw prompt)')
    .option('-l, --limit <value>', 'Max results, or "auto" for dynamic filtering', 'auto')
    .action(async (prompt, opts) => {
      const rootDir = process.cwd();
      const config = loadConfig(rootDir);
      const { db, vecAvailable } = openDatabase(
        configuredDbPath(config, rootDir),
        config.embeddings.config.dimensions
      );

      try {
        const repo = new EmbeddingsRepository(db, vecAvailable);
        const engine = createEmbeddingsEngine(config);
        const decomposer = opts.decompose
          ? new PromptDecomposer(createLlmClient(config))
          : null;
        const queryEngine = new QueryEngine({
          repository: repo,
          embeddingsEngine: engine,
          decomposer,
        });

        if (!opts.json && opts.decompose) logger.step('🔍 Decomposing query...');

        const { queries, results } = await queryEngine.search(prompt, {
          decompose: opts.decompose,
          limit: opts.limit,
        });

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                query_original: prompt,
                generated_queries: queries,
                total_results: results.length,
                results,
              },
              null,
              2
            )
          );
          return;
        }

        if (opts.decompose && queries.length > 1) {
          queries.forEach((q, i) => {
            const branch = i === queries.length - 1 ? '└─' : '├─';
            logger.dim(` ${branch} Q${i + 1}: ${q}`);
          });
          console.log();
        }

        logger.step('🔎 Querying embeddings database (SQLite)...');
        logger.info(`Found ${results.length} relevant chunks:\n`);

        results.forEach((r, i) => {
          const sep = '-'.repeat(80);
          console.log(sep);
          console.log(
            `${i + 1}. ${r.file_path} (Lines ${r.start_line}-${r.end_line}) | Similarity: ${r.similarity_score.toFixed(2)}`
          );
          console.log(sep);
          console.log(r.chunk);
          console.log();
        });
      } finally {
        db.close();
      }
    });
}
