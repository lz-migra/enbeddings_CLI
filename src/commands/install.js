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
      const availableAdapters = [...new Set([...embeddingAdapters, ...llmAdapters])];

      const adapterName = opts.adapter ?? (await p.select({
        message: 'Which adapter do you want to use?',
        options: availableAdapters.map((name) => ({ value: name, label: name })),
      }));

      const isEmbeddings = embeddingAdapters.includes(adapterName);
      const isLlm = llmAdapters.includes(adapterName);

      if (!isEmbeddings && !isLlm) {
        throw new Error(`Unknown adapter "${adapterName}". Available: ${availableAdapters.join(', ')}`);
      }

      const wantsEmbeddings = (targetType === 'embeddings' || targetType === 'both') && isEmbeddings;
      const wantsLlm = (targetType === 'llm' || targetType === 'both') && isLlm;

      if (!wantsEmbeddings && !wantsLlm) {
        throw new Error(
          `Adapter "${adapterName}" does not support the requested type "${targetType}". ` +
            `Available: embeddings=${isEmbeddings}, llm=${isLlm}.`
        );
      }

      const config = {
        ...DEFAULT_CONFIG,
        database: {
          path: path.join(os.homedir(), WORK_DIR, 'embeddings.db'),
        },
      };

      if (wantsEmbeddings && wantsLlm) {
        const embeddingsConfig = await runAdapterInstall(adapterName, 'embeddings');
        const llmConfig = await runAdapterInstall(adapterName, 'llm');
        config.embeddings = { provider: adapterName, config: embeddingsConfig };
        config.llm = { provider: adapterName, config: llmConfig };
      } else if (wantsEmbeddings) {
        const adapterConfig = await runAdapterInstall(adapterName, 'embeddings');
        config.embeddings = { provider: adapterName, config: adapterConfig };
      } else if (wantsLlm) {
        const adapterConfig = await runAdapterInstall(adapterName, 'llm');
        config.llm = { provider: adapterName, config: adapterConfig };
      }

      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n');
      p.logSuccess(`Created ${cfgPath}`);
      p.logInfo('Use .embeddings_service/.env for API keys (env:VAR references supported).');
      p.outro("You're all set!");
    });
}
