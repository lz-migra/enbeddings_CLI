import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  WORK_DIR,
  CONFIG_FILE,
  DB_FILE,
  WATCHER_PID_FILE,
  WATCHER_LOCK_FILE,
  WATCHER_LOG_FILE,
} from '../config/constants.js';

export function expandHome(p) {
  if (p.startsWith('~/') || p === '~') return path.join(os.homedir(), p.slice(1));
  return p;
}

export function assertSafeRoot(rootDir, operation = 'index') {
  const resolved = path.resolve(rootDir);
  const filesystemRoot = path.parse(resolved).root;
  const home = path.resolve(os.homedir());
  if (resolved === filesystemRoot || resolved === home) {
    throw new Error(
      `Refusing to ${operation} "${resolved}". Choose a specific project directory instead.`
    );
  }
}

export function globalWorkDir() {
  return path.join(os.homedir(), WORK_DIR);
}

export function projectWorkDir(cwd = process.cwd()) {
  return path.join(cwd, WORK_DIR);
}

/** Returns the project work dir if it exists, otherwise null. */
export function findProjectWorkDir(cwd = process.cwd()) {
  const dir = projectWorkDir(cwd);
  return fs.existsSync(dir) ? dir : null;
}

/** Active work dir: project-local if present, else global. */
export function activeWorkDir(cwd = process.cwd()) {
  return findProjectWorkDir(cwd) ?? globalWorkDir();
}

export function configPath(workDir) {
  return path.join(workDir, CONFIG_FILE);
}

export function dbPath(workDir) {
  return path.join(workDir, DB_FILE);
}

export function configuredDbPath(config, cwd = process.cwd()) {
  const configured = config?.database?.path;
  if (!configured) return dbPath(activeWorkDir(cwd));
  return path.resolve(cwd, expandHome(configured));
}

export function watcherPidPath(workDir) {
  return path.join(workDir, WATCHER_PID_FILE);
}

export function watcherLockPath(workDir) {
  return path.join(workDir, WATCHER_LOCK_FILE);
}

export function watcherLogPath(workDir) {
  return path.join(workDir, WATCHER_LOG_FILE);
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.hpp', '.cs', '.rb', '.php', '.swift', '.kt', '.md',
  '.json', '.yaml', '.yml', '.toml', '.sh', '.sql', '.html', '.css', '.vue',
]);

/** Skip binary files, files > 1MB, minified files, and ignored patterns. */
export function isIndexableFile(filePath, maxBytes) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return false;
    const ext = path.extname(filePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) return true;
    // Magic-byte sniffing for extensionless/unknown files: binary if NUL in first 8KB
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const read = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    return !buf.subarray(0, read).includes(0);
  } catch {
    return false;
  }
}

/**
 * Detect minified files by heuristics:
 * - Any line longer than 1000 characters.
 * - Low whitespace/newline ratio (< 5%) in the first 8KB.
 */
export function isMinifiedFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const read = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    const text = buf.subarray(0, read).toString('utf8');
    const lines = text.split('\n');
    if (lines.some((line) => line.length > 1000)) return true;
    const whitespace = (text.match(/\s/g) ?? []).length;
    return whitespace / text.length < 0.05;
  } catch {
    return false;
  }
}

/**
 * Detect embedded binary content (data URIs, Base64) in text files.
 * Returns true if the file contains a data URI or a long Base64 string.
 */
export function hasEmbeddedBinary(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const read = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    const text = buf.subarray(0, read).toString('utf8');
    return /data:[^;]+;base64,/.test(text) || /[A-Za-z0-9+/]{100,}={0,2}/.test(text);
  } catch {
    return false;
  }
}

export function walkFiles(rootDir, ignorePatterns, maxBytes) {
  const results = [];
  const ignored = (rel) =>
    ignorePatterns.some((pattern) => matchGlob(rel, pattern));
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(rootDir, full).split(path.sep).join('/');
      if (ignored(rel) || ignored(rel + (entry.isDirectory() ? '/' : ''))) continue;
      if (entry.isDirectory()) walk(full);
      else if (isIndexableFile(full, maxBytes)) results.push(full);
    }
  };
  walk(rootDir);
  return results;
}

/** Minimal glob matcher supporting **, * and ? */
export function matchGlob(str, pattern) {
  const globstarSlash = '__GLOBSTAR_SLASH__';
  const globstar = '__GLOBSTAR__';
  const protectedPattern = pattern
    .replace(/\*\*\//g, globstarSlash)
    .replace(/\*\*/g, globstar);
  const re = new RegExp(
    '^' +
      protectedPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(new RegExp(globstarSlash, 'g'), '(?:.*/)?')
        .replace(new RegExp(globstar, 'g'), '.*') +
      '$'
  );
  return re.test(str);
}
