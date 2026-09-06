import chokidar from 'chokidar';
import { matchGlob } from '../../utils/file-system.js';
import { logger } from '../../utils/logger.js';

/**
 * Watcher service: monitors file changes with debounce + batching.
 * Multiple events on the same file within the debounce window trigger
 * a single re-index.
 */
export class WatcherService {
  constructor({ indexer, rootDir, config, log = () => {} }) {
    this.indexer = indexer;
    this.rootDir = rootDir;
    this.log = log;
    this.debounceMs = config.watcher?.debounce_ms ?? 500;
    this.ignorePatterns = config.watcher?.ignore_patterns ?? [];
    this.pending = new Map(); // relPath -> { type, timer }
    this.watcher = null;
  }

  start() {
    this.log(`Watcher started on ${this.rootDir} (debounce: ${this.debounceMs}ms)`);
    this.watcher = chokidar.watch(this.rootDir, {
      ignoreInitial: true,
      persistent: true,
      ignored: (p) => {
        const rel = p.replace(this.rootDir + '/', '');
        return this.ignorePatterns.some((pat) => matchGlob(rel, pat));
      },
    });

    this.watcher
      .on('add', (p) => this.#schedule(p, 'index'))
      .on('change', (p) => this.#schedule(p, 'index'))
      .on('unlink', (p) => this.#schedule(p, 'remove'))
      .on('error', (err) => {
        this.log('Watcher error', err);
        logger.error(`Watcher error: ${err.message}`);
      });

    logger.success(`Watcher started on ${this.rootDir} (debounce: ${this.debounceMs}ms)`);
  }

  #schedule(absPath, type) {
    const existing = this.pending.get(absPath);
    if (existing) clearTimeout(existing.timer);
    // Chokidar reports a rename as unlink + add. Delay removals so the add
    // event can migrate existing chunks by file hash before purging anything.
    const delay = type === 'remove' ? this.debounceMs * 2 : this.debounceMs;
    const timer = setTimeout(() => this.#flush(absPath), delay);
    this.pending.set(absPath, { type, timer });
  }

  async #flush(absPath) {
    const entry = this.pending.get(absPath);
    this.pending.delete(absPath);
    if (!entry) return;
    try {
      if (entry.type === 'remove') {
        const n = this.indexer.removeFile(absPath);
        if (n > 0) {
          this.log(`Removed ${n} chunk(s) for deleted file: ${absPath}`);
          logger.info(`Removed ${n} chunk(s) for deleted file: ${absPath}`);
        }
      } else {
        const result = await this.indexer.indexFile(absPath);
        if (result.renamed) {
          this.log(`Renamed ${result.previousPath} to ${absPath} (${result.chunks} chunks reused)`);
          logger.info(`Renamed ${result.previousPath} to ${absPath} (${result.chunks} chunks reused)`);
        } else if (result.indexed) {
          this.log(`Re-indexed ${absPath} (${result.chunks} chunks)`);
          logger.info(`Re-indexed ${absPath} (${result.chunks} chunks)`);
        }
      }
    } catch (err) {
      this.log(`Failed to process ${absPath}`, err);
      logger.error(`Failed to process ${absPath}: ${err.message}`);
    }
  }

  async stop() {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    await this.watcher?.close();
    this.log('Watcher resources released');
  }
}
