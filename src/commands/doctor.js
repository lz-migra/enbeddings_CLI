import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfigDetails } from '../config/config-loader.js';
import { createEmbeddingsEngine } from '../infrastructure/ai-providers/factories/embeddings-factory.js';
import { createLlmClient } from '../infrastructure/ai-providers/factories/llm-factory.js';
import { configuredDbPath } from '../utils/file-system.js';
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

export function doctorCommand() {
  return new Command('doctor')
    .description('Show effective configuration and test configured providers')
    .option('--no-network', 'Skip provider network tests')
    .action(async (opts) => {
      const rootDir = process.cwd();
      const { config, sources } = loadConfigDetails(rootDir);
      const globalConfig = path.join(process.env.HOME ?? '', '.embeddings_service', 'config.jsonc');
      const projectConfig = path.join(rootDir, '.embeddings_service', 'config.jsonc');

      printSection('Effective configuration');
      for (const section of ['llm', 'embeddings']) {
        const sectionConfig = config[section] ?? {};
        const cfg = sectionConfig.config ?? {};
        logger.info(`${section}:`);
        logger.info(`  provider: ${sectionConfig.provider ?? '[missing]'} (${sources[`${section}.provider`] ?? 'unknown'})`);
        for (const key of Object.keys(cfg).filter((key) => key !== '_missingEnvVar')) {
          logger.info(`  config.${key}: ${displayValue(key, cfg[key])} (${sources[`${section}.config.${key}`] ?? 'unknown'})`);
        }
      }

      printSection('Local configuration overrides');
      const localOverrides = Object.entries(sources).filter(([, source]) => source === 'project');
      if (localOverrides.length === 0) {
        logger.info('No local property overrides the global/default configuration.');
      } else {
        for (const [key] of localOverrides) logger.info(`  ${key}: ${displayValue(key.split('.').pop(), key.split('.').reduce((value, part) => value?.[part], config))}`);
      }
      logger.dim(`Global: ${globalConfig}${fs.existsSync(globalConfig) ? '' : ' (does not exist)'}`);
      logger.dim(`Local:  ${projectConfig}${fs.existsSync(projectConfig) ? '' : ' (does not exist)'}`);

      const databaseFile = configuredDbPath(config, rootDir);
      printSection('Database');
      logger.info(`Path: ${databaseFile}`);
      logger.info(`Status: ${fs.existsSync(databaseFile) ? 'exists' : 'will be created during indexing'}`);

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