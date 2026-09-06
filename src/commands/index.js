import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig } from '../config/config-loader.js';
import { openDatabase } from '../infrastructure/database/sqlite-client.js';
import { EmbeddingsRepository } from '../infrastructure/database/repositories/embeddings-repository.js';
import { createEmbeddingsEngine } from '../infrastructure/ai-providers/factories/embeddings-factory.js';
import { Indexer } from '../core/indexer/indexer.js';
import { assertSafeRoot, configuredDbPath, ensureDir } from '../utils/file-system.js';
import { logger, withSpinner } from '../utils/logger.js';

export function indexCommand() {
  return new Command('index')
    .description('Index the codebase (or a single file) into the embeddings database')
    .argument('[path]', 'Optional file or directory to index (defaults to cwd)')
    .option('--reindex', 'Re-index everything, ignoring stored hashes')
    .option('--force', 'Force re-index even if hashes match')
    .action(async (target, opts) => {
      const rootDir = process.cwd();
      if (!target) assertSafeRoot(rootDir, 'index');
      const config = loadConfig(rootDir);
      const databaseFile = configuredDbPath(config, rootDir);
      ensureDir(path.dirname(databaseFile));
      const { db, vecAvailable } = openDatabase(databaseFile, config.embeddings.config.dimensions);

      try {
        const repo = new EmbeddingsRepository(db, vecAvailable);
        const engine = createEmbeddingsEngine(config);
        const indexer = new Indexer({ config, repository: repo, embeddingsEngine: engine, rootDir });

        if (target) {
          const abs = path.resolve(rootDir, target);
          const stat = fs.statSync(abs, { throwIfNoEntry: false });
          if (!stat) throw new Error(`Path not found: ${target}`);
          if (stat.isDirectory()) {
            assertSafeRoot(abs, 'index');
            const sub = new Indexer({ config, repository: repo, embeddingsEngine: engine, rootDir: abs });
            const result = await withSpinner(`Indexing ${abs}…`, () =>
              sub.indexAll({ force: opts.force || opts.reindex })
            );
            logger.success(`Indexing complete: ${result.total - result.failed}/${result.total} files, ${result.chunks} chunks.`);
          } else {
            const result = await withSpinner(`Indexing ${target}…`, () =>
              indexer.indexFile(abs, { force: opts.force || opts.reindex })
            );
            if (result.indexed) logger.success(`Indexed ${target} (${result.chunks} chunks)`);
            else logger.dim(`Skipped ${target} (unchanged or not indexable)`);
          }
        } else {
          const { total, failed } = await withSpinner(`Indexing ${rootDir}…`, () =>
            indexer.indexAll({ force: opts.force || opts.reindex })
          );
          logger.success(`Indexing complete: ${total - failed}/${total} files indexed.`);
        }
      } finally {
        db.close();
      }
    });
}
