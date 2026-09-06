import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, WORK_DIR, CONFIG_FILE } from '../config/constants.js';
import { ensureDir } from '../utils/file-system.js';
import { logger } from '../utils/logger.js';
import { registry } from '../infrastructure/ai-providers/core/index.js';
import * as p from '../utils/prompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADAPTERS_DIR = path.resolve(__dirname, '../infrastructure/ai-providers/adapters');

async function runAdapterInstall(adapterName, type) {
  const adapterPath = path.join(ADAPTERS_DIR, adapterName, 'install.js');
  if (!fs.existsSync(adapterPath)) {
    throw new Error(`No install script found for adapter "${adapterName}"`);
  }
  const { install } = await import(adapterPath);
  return install({ ask: p.askLegacy, confirm: p.confirmLegacy, type });
}

export function installCommand() {
  return new Command('install')
    .description('Configure the global ~/.embeddings_service/config.jsonc interactively')
    .option('--adapter <name>', 'Adapter to configure (e.g. openai-compatible, nvidia-nim)')
    .option('--type <type>', 'Which AI section to configure: embeddings, llm, or both', 'both')
    .action(async (opts) => {
      const globalDir = path.join(os.homedir(), WORK_DIR);
      ensureDir(globalDir);
      const cfgPath = path.join(globalDir, CONFIG_FILE);

      const validTypes = ['embeddings', 'llm', 'both'];
      const targetType = opts.type;
      if (!validTypes.includes(targetType)) {
        throw new Error(`Invalid --type "${targetType}". Use one of: ${validTypes.join(', ')}`);
      }

      p.intro('Configuring...');

      if (fs.existsSync(cfgPath)) {
        p.logWarn(`Config already exists at ${cfgPath}`);
        const shouldContinue = await p.confirm({
          message: 'Do you want to continue? The current configuration will be overwritten.',
        });
        if (!shouldContinue) {
          p.cancel('Operation cancelled.');
        }
      }

      const embeddingAdapters = registry.listEmbeddings();
      const llmAdapters = registry.listLlm();

      const targetTypeResolved =
        opts.type === 'both'
          ? await p.multiselect({
              message: 'What do you want to configure? (Space to select)',
              options: [
                { value: 'embeddings', label: 'Embeddings' },
                { value: 'llm', label: 'LLM' },
              ],
              required: true,
            })
          : [opts.type];

      const wantsEmbeddings = targetTypeResolved.includes('embeddings');
      const wantsLlm = targetTypeResolved.includes('llm');

      const config = {
        ...DEFAULT_CONFIG,
        database: {
          path: path.join(os.homedir(), WORK_DIR, 'embeddings.db'),
        },
      };

      if (wantsEmbeddings) {
        const embeddingAdapter =
          opts.adapter ??
          (await p.select({
            message: 'Which adapter do you want to use for Embeddings?',
            options: embeddingAdapters.map((name) => ({ value: name, label: name })),
          }));
        if (!embeddingAdapters.includes(embeddingAdapter)) {
          throw new Error(
            `Adapter "${embeddingAdapter}" is not registered for embeddings. Available: ${embeddingAdapters.join(', ')}`
          );
        }
        const embeddingsConfig = await runAdapterInstall(embeddingAdapter, 'embeddings');
        config.embeddings = { provider: embeddingAdapter, config: embeddingsConfig };
      }

      if (wantsLlm) {
        const llmAdapter =
          opts.adapter ??
          (await p.select({
            message: 'Which adapter do you want to use for LLM?',
            options: llmAdapters.map((name) => ({ value: name, label: name })),
          }));
        if (!llmAdapters.includes(llmAdapter)) {
          throw new Error(
            `Adapter "${llmAdapter}" is not registered for LLM. Available: ${llmAdapters.join(', ')}`
          );
        }
        const llmConfig = await runAdapterInstall(llmAdapter, 'llm');
        config.llm = { provider: llmAdapter, config: llmConfig };
      }

      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n');
      p.logSuccess(`Created ${cfgPath}`);
      p.logInfo('Use .embeddings_service/.env for API keys (env:VAR references supported).');
      p.outro("You're all set!");
    });
}
