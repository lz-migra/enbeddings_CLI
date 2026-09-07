import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, WORK_DIR, CONFIG_FILE, ENV_FILE } from '../config/constants.js';
import { ensureDir } from '../utils/file-system.js';
import { logger } from '../utils/logger.js';
import { registry } from '../infrastructure/ai-providers/core/index.js';
import * as p from '../utils/prompt.js';
import { writeEnvFile } from '../utils/env-file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADAPTERS_DIR = path.resolve(__dirname, '../infrastructure/ai-providers/adapters');

async function runAdapterInstall(adapterName, type, ctx) {
  const adapterPath = path.join(ADAPTERS_DIR, adapterName, 'install.js');
  if (!fs.existsSync(adapterPath)) {
    throw new Error(`No install script found for adapter "${adapterName}"`);
  }
  const { install } = await import(adapterPath);
  // Adapters use the simple positional signature: ask(message, defaultValue)
  // and confirm(message, defaultValue). Translate to clack's object form here.
  const ask = (message, initialValue) => p.text({ message, initialValue });
  const confirm = (message, initialValue = false) => p.confirm({ message, initialValue });
  return install({
    ask,
    confirm,
    select: p.select,
    password: p.password,
    type,
    mode: ctx.mode,
    envFile: ctx.envFile,
    adapter: adapterName,
  });
}

export function installCommand() {
  return new Command('install')
    .description('Configures the global ~/.embeddings_service/config.jsonc (use init for project-local config)')
    .option('--adapter <name>', 'Adapter to configure (e.g. openai-compatible, nvidia-nim)')
    .option('--type <type>', 'Which AI section to configure: embeddings, llm, or both', 'both')
    .option('--no-tui', 'Disable the interactive TUI and use flags only')
    .action(async (opts) => {
      // install always targets the global config, regardless of cwd.
      // Project-local configuration is handled by `init`.
      const baseDir = path.join(os.homedir(), WORK_DIR);
      ensureDir(baseDir);
      const cfgPath = path.join(baseDir, CONFIG_FILE);
      const envFile = path.join(baseDir, ENV_FILE);
      const installCtx = { mode: opts.tui ? 'tui' : 'no-tui', envFile };

      const validTypes = ['embeddings', 'llm', 'both'];
      const targetType = opts.type;
      if (!validTypes.includes(targetType)) {
        throw new Error(`Invalid --type "${targetType}". Use one of: ${validTypes.join(', ')}`);
      }

      if (opts.tui) {
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

        const sections = await p.multiselect({
          message: 'Select what you want to configure (Space to select):',
          options: [
            { value: 'embeddings', label: 'Embeddings' },
            { value: 'llm', label: 'LLM' },
          ],
          required: true,
        });

        const embeddingAdapters = registry.listEmbeddings();
        const llmAdapters = registry.listLlm();
        const availableAdapters = [...new Set([...embeddingAdapters, ...llmAdapters])];

        const config = { ...DEFAULT_CONFIG };

        for (const section of sections) {
          const adapters = section === 'embeddings' ? embeddingAdapters : llmAdapters;
          const adapterName = await p.select({
            message: `Which adapter do you want to use for ${section}?`,
            options: adapters.map((name) => ({ value: name, label: name })),
          });

          const adapterConfig = await runAdapterInstall(adapterName, section, installCtx);
          config[section] = { provider: adapterName, config: adapterConfig };
        }

        writeEnvFile(envFile, {});
        fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n');
        p.logSuccess(`Created ${cfgPath}`);
        p.logInfo(`Secrets stored in ${envFile} (mode 0600).`);
        p.outro("You're all set!");
        return;
      }

      if (fs.existsSync(cfgPath)) {
        logger.warn(`Config already exists at ${cfgPath}`);
        return;
      }

      const embeddingAdapters = registry.listEmbeddings();
      const llmAdapters = registry.listLlm();

      if (!opts.adapter) {
        throw new Error('In --no-tui mode you must pass --adapter <name>.');
      }

      const wantsEmbeddings = (targetType === 'embeddings' || targetType === 'both') && embeddingAdapters.includes(opts.adapter);
      const wantsLlm = (targetType === 'llm' || targetType === 'both') && llmAdapters.includes(opts.adapter);

      if (!wantsEmbeddings && !wantsLlm) {
        throw new Error(
          `Adapter "${opts.adapter}" does not support the requested type "${targetType}". ` +
            `Available: embeddings=${embeddingAdapters.includes(opts.adapter)}, llm=${llmAdapters.includes(opts.adapter)}.`
        );
      }

      logger.step(`Configuring ${opts.adapter}...`);
      const config = { ...DEFAULT_CONFIG };

      if (wantsEmbeddings) {
        const embeddingsConfig = await runAdapterInstall(opts.adapter, 'embeddings', installCtx);
        config.embeddings = { provider: opts.adapter, config: embeddingsConfig };
      }

      if (wantsLlm) {
        const llmConfig = await runAdapterInstall(opts.adapter, 'llm', installCtx);
        config.llm = { provider: opts.adapter, config: llmConfig };
      }

      writeEnvFile(envFile, {});
      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n');
      logger.success(`Created ${cfgPath}`);
      logger.dim(`Secrets stored in ${envFile} (mode 0600).`);
    });
}
