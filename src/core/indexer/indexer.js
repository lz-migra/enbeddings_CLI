import path from 'node:path';
import fs from 'node:fs';
import { ChunkerEngine } from '../chunking/chunker-engine.js';
import { sha256File, uuid } from '../../utils/hash.js';
import { walkFiles, isIndexableFile } from '../../utils/file-system.js';
import { MAX_FILE_SIZE_BYTES } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';

const EMBED_BATCH_SIZE = 32;

/**
 * Indexing flow orchestrator. Implements Strategy A (file-level replacement):
 * hash check -> purge -> re-chunk -> embed -> insert.
 */
export class Indexer {
  constructor({ config, repository, embeddingsEngine, rootDir }) {
    this.config = config;
    this.repo = repository;
    this.engine = embeddingsEngine;
    this.rootDir = path.resolve(rootDir);
    this.chunker = new ChunkerEngine(config.chunking);
    this.failures = [];
  }

  validateModel() {
    const stored = this.repo.getIndexedModel();
    if (stored && stored !== this.engine.model) {
      throw new Error(
        `Model mismatch: index was built with "${stored}" but config uses "${this.engine.model}".\n` +
          'Run: embeddings-service index --reindex --force'
      );
    }
  }

  async indexAll({ force = false } = {}) {
    this.validateModel();
    const ignore = this.config.watcher?.ignore_patterns ?? [];
    const files = walkFiles(this.rootDir, ignore, MAX_FILE_SIZE_BYTES);
    logger.info(`Found ${files.length} indexable files.`);

    let done = 0;
    let totalChunks = 0;
    for (const file of files) {
      try {
        const result = await this.indexFile(file, { force });
        if (result.indexed) totalChunks += result.chunks;
      } catch (err) {
        this.failures.push({ file, error: err.message });
      }
      done++;
      logger.progress(`Indexed ${done}/${files.length} files (${totalChunks} chunks)...`);
    }

    if (this.failures.length > 0) {
      logger.warn(`${this.failures.length} file(s) failed to index:`);
      for (const f of this.failures) logger.dim(`  - ${f.file}: ${f.error}`);
    }
    return { total: files.length, chunks: totalChunks, failed: this.failures.length };
  }

  /** Index a single file. Skips if hash unchanged (unless force). */
  async indexFile(absPath, { force = false } = {}) {
    if (!isIndexableFile(absPath, MAX_FILE_SIZE_BYTES)) return { skipped: true };

    const relPath = path.relative(this.rootDir, absPath).split(path.sep).join('/');
    const fileHash = sha256File(absPath);

    if (!force && this.repo.getFileHash(relPath) === fileHash) {
      return { skipped: true };
    }

    if (!force) {
      const previousPath = this.repo.findFileByHash(fileHash, relPath);
      if (previousPath) {
        const chunks = this.repo.renameFile(previousPath, relPath);
        return { renamed: true, previousPath, chunks };
      }
    }

    // Strategy A: purge existing records for this file
    this.repo.deleteByFile(relPath);

    const chunks = await this.chunker.chunkFile(absPath);
    if (chunks.length === 0) return { skipped: true };

    const records = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const embeddings = await this.engine.embedPassages(batch.map((c) => c.content));
      for (let j = 0; j < batch.length; j++) {
        records.push({
          uuid: uuid(),
          file_path: relPath,
          file_hash: fileHash,
          start_line: batch[j].startLine,
          end_line: batch[j].endLine,
          content: batch[j].content,
          model: this.engine.model,
          created_at: Date.now(),
          root_dir: this.rootDir,
          embedding: embeddings[j],
        });
      }
    }
    this.repo.insertChunks(records);
    return { indexed: true, chunks: records.length };
  }

  /** Handle file deletion: purge only. */
  removeFile(absPath) {
    const relPath = path.relative(this.rootDir, absPath).split(path.sep).join('/');
    return this.repo.deleteByFile(relPath);
  }
}
