import fs from 'node:fs';
import { parse as parseDotenv } from 'dotenv';
import { parse as parseJsonc } from 'jsonc-parser';
import { DEFAULT_CONFIG } from './constants.js';
import {
  globalWorkDir,
  findProjectWorkDir,
  configPath,
  expandHome,
} from '../utils/file-system.js';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge: override wins; objects merge recursively.
 *  Special rule for AI sections (embeddings / llm): when the override declares a
 *  different `provider`, the inner `config` block is replaced wholesale
 *  instead of being merged — providers have different schemas and mixing
 *  fields from two providers produces invalid configurations.
 */
export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override ?? base;

  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      (key === 'embeddings' || key === 'llm') &&
      isPlainObject(value) &&
      'provider' in value &&
      isPlainObject(base?.[key]) &&
      base[key].provider &&
      base[key].provider !== value.provider
    ) {
      // Provider changed: drop stale fields and use the override as-is.
      out[key] = value;
      continue;
    }
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

function readJson(file) {
  try {
    return parseJsonc(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSONC in ${file}: ${err.message}`);
  }
}

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return parseDotenv(fs.readFileSync(file));
  } catch (err) {
    throw new Error(`Invalid dotenv file ${file}: ${err.message}`);
  }
}

function markSources(value, source, output, prefix = '') {
  if (!isPlainObject(value)) {
    if (prefix) output[prefix] = source;
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    markSources(child, source, output, prefix ? `${prefix}.${key}` : key);
  }
}

function sourcePaths(base, override, source, sources, prefix = '') {
  // Leaf reached: if the override value differs from the base, the leaf
  // originated from `source`.
  if (!isPlainObject(override)) {
    if (prefix && JSON.stringify(base) !== JSON.stringify(override)) sources[prefix] = source;
    return;
  }
  // Special case: provider switch inside an AI section — every leaf under
  // section.config is now owned by `source`.
  const isProviderSwitch =
    prefix === 'embeddings' || prefix === 'llm';
  if (isProviderSwitch && 'provider' in override) {
    for (const [key, value] of Object.entries(override)) {
      const keyPath = prefix ? `${prefix}.${key}` : key;
      markLeafSources(value, source, sources, keyPath);
    }
    return;
  }
  for (const [key, value] of Object.entries(override)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    sourcePaths(base?.[key], value, source, sources, keyPath);
  }
}

/** Walk a value and return every leaf path. Used to tag nested leaves. */
export function markLeafSources(value, source, output, prefix = '') {
  if (!isPlainObject(value)) {
    if (prefix) output[prefix] = source;
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    markLeafSources(child, source, output, prefix ? `${prefix}.${key}` : key);
  }
}

function resolveEnvReferences(value, envFiles, sources, prefix) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => resolveEnvReferences(item, envFiles, sources, `${prefix}.${index}`));
    return;
  }
  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const keyPath = `${prefix}.${key}`;
    if (typeof child === 'string' && child.startsWith('env:')) {
      const envVar = child.slice(4);
      const envSource = process.env[envVar]
        ? 'process.env'
        : envFiles.project[envVar]
          ? 'project .env'
          : envFiles.global[envVar]
            ? 'global .env'
            : null;
      value[key] = process.env[envVar] || envFiles.project[envVar] || envFiles.global[envVar];
      if (envSource) sources[keyPath] = envSource;
      if (!value[key]) value._missingEnvVar = envVar;
    } else {
      resolveEnvReferences(child, envFiles, sources, keyPath);
    }
  }
}

/**
 * Loads configuration: defaults <- global (~/.embeddings_service/config.jsonc)
 * <- project (./.embeddings_service/config.jsonc). Project keys override global.
 */
export function loadConfig(cwd = process.cwd()) {
  return loadConfigDetails(cwd).config;
}

/** Loads the effective config and records where each leaf value came from. */
export function loadConfigDetails(cwd = process.cwd()) {
  let config = structuredClone(DEFAULT_CONFIG);
  const sources = {};
  markSources(DEFAULT_CONFIG, 'default', sources);

  const globalDir = globalWorkDir();
  const globalCfgPath = configPath(globalDir);
  const globalEnv = readEnv(`${globalDir}/.env`);
  if (fs.existsSync(globalCfgPath)) {
    const override = readJson(globalCfgPath);
    config = deepMerge(config, override);
    sourcePaths(DEFAULT_CONFIG, override, 'global', sources);
  }

  const projectDir = findProjectWorkDir(cwd);
  const projectEnv = projectDir ? readEnv(`${projectDir}/.env`) : {};
  if (projectDir) {
    const projectCfgPath = configPath(projectDir);
    if (fs.existsSync(projectCfgPath)) {
      const override = readJson(projectCfgPath);
      const lowerConfig = config;
      config = deepMerge(config, override);
      sourcePaths(lowerConfig, override, 'project', sources);
    }
  }

  // Resolve nested "env:VAR_NAME" references. Process environment wins over .env files.
  const envFiles = { global: globalEnv, project: projectEnv };
  for (const section of ['embeddings', 'llm']) {
    const adapterConfig = config[section]?.config;
    if (adapterConfig) resolveEnvReferences(adapterConfig, envFiles, sources, `${section}.config`);
  }

  if (config.database?.path) {
    config.database.path = expandHome(config.database.path);
  }

  return { config, sources };
}

