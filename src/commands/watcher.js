import { Command } from 'commander';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { loadConfig } from '../config/config-loader.js';
import { openDatabase } from '../infrastructure/database/sqlite-client.js';
import { EmbeddingsRepository } from '../infrastructure/database/repositories/embeddings-repository.js';
import { createEmbeddingsEngine } from '../infrastructure/ai-providers/factories/embeddings-factory.js';
import { Indexer } from '../core/indexer/indexer.js';
import { WatcherService } from '../core/indexer/watcher-service.js';
import {
  activeWorkDir,
  assertSafeRoot,
  dbPath,
  ensureDir,
  watcherPidPath,
  watcherLockPath,
  watcherLogPath,
} from '../utils/file-system.js';
import { logger } from '../utils/logger.js';

function writeWatcherLog(workDir, message, error = null) {
  const suffix = error ? `: ${error.stack ?? error.message}` : '';
  const line = `[${new Date().toISOString()}] ${message}${suffix}\n`;
  try {
    fs.appendFileSync(watcherLogPath(workDir), line);
  } catch (logError) {
    logger.error(`Failed to write watcher log: ${logError.message}`);
  }
}

function readPid(workDir) {
  try {
    const data = JSON.parse(fs.readFileSync(watcherPidPath(workDir), 'utf8'));
    process.kill(data.pid, 0); // throws if dead
    return data;
  } catch {
    return null; // missing or stale
  }
}

function cleanStale(workDir) {
  for (const p of [watcherPidPath(workDir), watcherLockPath(workDir)]) {
    try {
      fs.rmSync(p, { force: true, recursive: true });
    } catch {}
  }
}

export function watcherCommand() {
  const cmd = new Command('watcher').description('Manage the background file watcher');

  cmd
    .command('start')
    .description('Start the watcher as a detached background process')
    .option('--foreground', 'Run in the foreground (do not detach)')
    .action(async (opts) => {
      const rootDir = process.cwd();
      assertSafeRoot(rootDir, 'watch');
      const workDir = ensureDir(activeWorkDir(rootDir));

      const existing = readPid(workDir);
      if (existing) {
        logger.warn(`Watcher already running (PID ${existing.pid}).`);
        return;
      }
      cleanStale(workDir);

      if (!opts.foreground) {
        writeWatcherLog(workDir, `Starting background watcher for ${rootDir}`);
        const child = spawn(
          process.execPath,
          [process.argv[1], 'watcher', 'start', '--foreground'],
          {
            cwd: rootDir,
            detached: true,
            stdio: 'ignore',
            env: process.env,
          }
        );
        child.on('error', (error) => {
          writeWatcherLog(workDir, 'Background watcher failed to spawn', error);
        });
        child.on('exit', (code, signal) => {
          if (code !== 0 || signal) {
            writeWatcherLog(
              workDir,
              `Background watcher exited unexpectedly (code=${code ?? 'none'}, signal=${signal ?? 'none'})`
            );
          }
        });
        child.unref();
        writeWatcherLog(workDir, `Background watcher spawned with PID ${child.pid}`);
        logger.success(`Watcher start requested (PID ${child.pid}).`);
        return;
      }

      // Foreground: acquire single-instance lock and run
      writeWatcherLog(workDir, `Starting watcher for ${rootDir} (PID ${process.pid})`);
      const lockPath = watcherLockPath(workDir);
      fs.writeFileSync(lockPath, '');
      let release;
      try {
        release = await lockfile.lock(lockPath, { stale: 10000 });
      } catch (error) {
        writeWatcherLog(workDir, 'Failed to acquire watcher lock', error);
        logger.error('Another watcher instance holds the lock. Aborting.');
        process.exit(1);
      }
      let db;
      let watcher;
      try {
        fs.writeFileSync(
          watcherPidPath(workDir),
          JSON.stringify({ pid: process.pid, started_at: Date.now() })
        );

        const config = loadConfig(rootDir);
        const opened = openDatabase(dbPath(workDir), config.embeddings.config.dimensions);
        db = opened.db;
        const repo = new EmbeddingsRepository(db, opened.vecAvailable);
        const engine = createEmbeddingsEngine(config);
        const indexer = new Indexer({ config, repository: repo, embeddingsEngine: engine, rootDir });
        watcher = new WatcherService({
          indexer,
          rootDir,
          config,
          log: (message, error) => writeWatcherLog(workDir, message, error),
        });
        watcher.start();
        writeWatcherLog(workDir, 'Watcher is ready');
      } catch (error) {
        writeWatcherLog(workDir, 'Watcher failed during startup', error);
        try {
          db?.close();
          await release();
        } finally {
          cleanStale(workDir);
        }
        throw error;
      }

      const shutdown = async () => {
        try {
          writeWatcherLog(workDir, 'Stopping watcher');
          await watcher?.stop();
          db?.close();
          await release();
          writeWatcherLog(workDir, 'Watcher stopped');
          cleanStale(workDir);
          process.exit(0);
        } catch (error) {
          writeWatcherLog(workDir, 'Watcher failed during shutdown', error);
          cleanStale(workDir);
          process.exit(1);
        }
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });

  cmd
    .command('stop')
    .description('Stop the background watcher')
    .action(() => {
      const workDir = activeWorkDir(process.cwd());
      const data = readPid(workDir);
      if (!data) {
        logger.warn('No running watcher found.');
        cleanStale(workDir);
        return;
      }
      try {
        process.kill(data.pid, 'SIGTERM');
        logger.success(`Stopped watcher (PID ${data.pid}).`);
      } catch (err) {
        logger.error(`Failed to stop watcher: ${err.message}`);
      }
      cleanStale(workDir);
    });

  cmd
    .command('status')
    .description('Show watcher status')
    .action(() => {
      const workDir = activeWorkDir(process.cwd());
      const data = readPid(workDir);
      if (data) {
        logger.success(`Watcher running (PID ${data.pid}, started ${new Date(data.started_at).toISOString()})`);
      } else {
        logger.info('Watcher is not running.');
        cleanStale(workDir);
      }
    });

  return cmd;
}
