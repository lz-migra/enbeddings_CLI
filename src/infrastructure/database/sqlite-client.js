import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { logger } from '../../utils/logger.js';

/**
 * Opens (creating if needed) the SQLite database, loads sqlite-vec when
 * available, and ensures the schema exists.
 */
export function openDatabase(dbFilePath, dimensions) {
  const db = new Database(dbFilePath);
  db.pragma('journal_mode = WAL');

  let vecAvailable = true;
  try {
    sqliteVec.load(db);
  } catch {
    vecAvailable = false;
    logger.warn(
      'sqlite-vec could not be loaded; falling back to in-memory cosine similarity (slower).'
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      uuid TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      start_line INTEGER,
      end_line INTEGER,
      content TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
  `);

  // Migration: add root_dir column for project-scoped search.
  const hasRootDir = db
    .prepare("SELECT 1 FROM pragma_table_info('chunks') WHERE name = 'root_dir'")
    .get();
  if (!hasRootDir) {
    db.exec('ALTER TABLE chunks ADD COLUMN root_dir TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_root_dir ON chunks(root_dir)');
    const legacy = db
      .prepare('SELECT COUNT(*) AS n FROM chunks WHERE root_dir IS NULL')
      .get().n;
    if (legacy > 0) {
      logger.warn(
        `${legacy} existing chunk(s) have no root_dir (indexed before project scoping). ` +
          'They will only appear in `search --all`. Run `index --reindex --force` to re-tag them.'
      );
    }
  }

  if (vecAvailable) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
        uuid TEXT PRIMARY KEY,
        embedding FLOAT[${dimensions}] distance_metric=cosine
      );
    `);
  } else {
    // Fallback: store vectors as JSON blobs
    db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_vectors_fallback (
        uuid TEXT PRIMARY KEY,
        embedding TEXT NOT NULL
      );
    `);
  }

  return { db, vecAvailable };
}
