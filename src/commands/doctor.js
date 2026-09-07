// filepath: src/commands/doctor.js
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { parse as parseDotenv } from 'dotenv';
import { loadConfigDetails } from '../config/config-loader.js';
import { createEmbeddingsEngine } from '../infrastructure/ai-providers/factories/embeddings-factory.js';
import { createLlmClient } from '../infrastructure/ai-providers/factories/llm-factory.js';
import { registry } from '../infrastructure/ai-providers/core/index.js';
import { configuredDbPath, globalWorkDir, projectWorkDir } from '../utils/file-system.js';
import { logger, withSpinner } from '../utils/logger.js';

function displayValue(key, value) {
  if (key === 'api_key') return value ? '[configured]' : '[missing]';
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value ?? '[missing]');
}

function printSection(title) {
  logger.step(`\n${title}`);
  logger.dim('-'.repeat(title.length));
}

function readJsoncFile(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return parseJsonc(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { _error: err.message };
  }
}

function readDotenvFile(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return parseDotenv(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function listAdapterNames() {
  return Array.from(new Set([...registry.listEmbeddings(), ...registry.listLlm()]));
}

/** Return every dotted leaf path inside `obj`. */
function collectLeafPaths(obj, prefix = '') {
  const out = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out.push(prefix);
    return out;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) continue;
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...collectLeafPaths(value, full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function findEnvVarNames(value) {
  const names = [];
  const walk = (v) => {
    if (typeof v === 'string' && v.startsWith('env:')) names.push(v.slice(4));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return names;
}

function listEnvStatus(envVars, envs) {
  return envVars.map((name) => {
    if (process.env[name]) return { name, source: 'process env', ok: true };
    if (envs.project[name]) return { name, source: 'project .env', ok: true };
    if (envs.global[name]) return { name, source: 'global .env', ok: true };
    return { name, source: 'missing', ok: false };
  });
}

export function doctorCommand() {
  return new Command('doctor')
    .description('Show effective configuration and test configured providers')
    .option('--no-network', 'Skip provider network tests')
    .action(async (opts) => {
      const rootDir = process.cwd();
      const { config, sources } = loadConfigDetails(rootDir);

      const globalDir = globalWorkDir();
      const projectDir = projectWorkDir(rootDir);
      const globalCfg = path.join(globalDir, 'config.jsonc');
      const projectCfg = path.join(projectDir, 'config.jsonc');
      const envs = {
        global: readDotenvFile(path.join(globalDir, '.env')),
        project: readDotenvFile(path.join(projectDir, '.env')),
      };

      // ----- Effective configuration -----
      printSection('Effective configuration');
      for (const section of ['embeddings', 'llm']) {
        const sectionConfig = config[section];
        if (!sectionConfig) {
          logger.warn(`${section}: not configured (no local or global config found)`);
          continue;
        }
        const providerSource = sources[`${section}.provider`];
        logger.info(`${section}:`);
        logger.info(
          `  provider: ${sectionConfig.provider} (${providerSource ?? 'unknown'})`
        );
        if (providerSource && providerSource !== 'project') {
          logger.dim(
            `  ↳ inherited from ${providerSource} config (no local ${section} section defined).`
          );
        }
        const cfg = sectionConfig.config ?? {};
        const leafPaths = collectLeafPaths(cfg, `${section}.config`);
        for (const fullPath of leafPaths) {
          const value = fullPath.split('.').reduce((v, p) => v?.[p], config);
          const lastKey = fullPath.split('.').pop();
          const displayKey = fullPath.slice(`${section}.config.`.length);
          logger.info(
            `  config.${displayKey}: ${displayValue(lastKey, value)} (${sources[fullPath] ?? 'unknown'})`
          );
        }
        const envStatus = listEnvStatus(findEnvVarNames(cfg), envs);
        if (envStatus.length) {
          for (const { name, source, ok } of envStatus) {
            const label = ok ? source : 'MISSING (run `install` or export it)';
            logger[ok ? 'dim' : 'warn'](`  secret ${name}: ${label}`);
          }
        }
      }

      // ----- Local overrides (real diff against global) -----
      printSection('Local configuration overrides');
      const globalConfig = readJsoncFile(globalCfg);
      const projectConfig = readJsoncFile(projectCfg);
      const leafOverrides = Object.entries(sources)
        .filter(([, source]) => source === 'project')
        .map(([path]) => path)
        .sort();
      if (leafOverrides.length === 0) {
        logger.info('No local overrides (project config matches global).');
      } else {
        for (const leafPath of leafOverrides) {
          const value = leafPath.split('.').reduce((v, p) => v?.[p], config);
          const lastKey = leafPath.split('.').pop();
          logger.info(`  ${leafPath}: ${displayValue(lastKey, value)}`);
        }
      }
      logger.dim(`Global: ${globalCfg}${fs.existsSync(globalCfg) ? '' : ' (does not exist)'}`);
      logger.dim(`Local:  ${projectCfg}${fs.existsSync(projectCfg) ? '' : ' (does not exist)'}`);

      // ----- Adapter consistency -----
      printSection('Adapter validation');
      const known = new Set(listAdapterNames());
      const issues = [];
      for (const section of ['embeddings', 'llm']) {
        const provider = config[section]?.provider;
        if (!provider) continue;
        if (!known.has(provider)) {
          issues.push(`${section}.provider '${provider}' is not registered`);
        }
      }
      if (issues.length === 0) {
        logger.success('All configured providers are registered.');
      } else {
        for (const issue of issues) logger.error(`- ${issue}`);
      }

      // ----- Database -----
      const databaseFile = configuredDbPath(config, rootDir);
      printSection('Database');
      logger.info(`Path: ${databaseFile}`);
      logger.info(
        `Status: ${fs.existsSync(databaseFile) ? 'exists' : 'will be created during indexing'}`
      );

      // ----- Provider tests -----
      if (opts.network) {
        printSection('Provider tests');
        try {
          const llm = createLlmClient(config);
          const response = await withSpinner('Testing LLM provider…', () =>
            llm.chat([{ role: 'user', content: 'Reply with only: OK' }], { maxTokens: 1024 })
          );
          logger.success(`LLM: OK (${response.trim().slice(0, 80)})`);
        } catch (error) {
          logger.error(`LLM: ERROR - ${error.message}`);
        }

        try {
          const embeddings = createEmbeddingsEngine(config);
          const vectors = await withSpinner('Testing embeddings provider…', () =>
            embeddings.embedQueries(['Test text for verifying embeddings.'])
          );
          const vector = vectors?.[0];
          if (!Array.isArray(vector) || vector.length === 0) throw new Error('the provider did not return a valid vector');
          logger.success(`Embeddings: OK (${vector.length} dimensions)`);
        } catch (error) {
          logger.error(`Embeddings: ERROR - ${error.message}`);
        }
      } else {
        logger.dim('Network tests skipped by --no-network.');
      }
    });
}
