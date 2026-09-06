import { BaseLlmProvider } from '../../core/base-llm.js';
import { validateObject } from '../../core/config-validation.js';
import { CustomCommandRunner } from './command.js';

export function validateLlmConfig(config) {
  const errors = validateObject(config, {
    command: { required: true, type: 'string' },
  });
  if (config?.timeout_ms !== undefined && (!Number.isInteger(config.timeout_ms) || config.timeout_ms <= 0)) {
    errors.push('timeout_ms must be a positive integer');
  }
  if (config?.output_filter_regex !== undefined && typeof config.output_filter_regex !== 'string') {
    errors.push('output_filter_regex must be a string');
  }
  return errors;
}

export class CustomCommandLlm extends BaseLlmProvider {
  constructor(config, http) {
    super(config, http);
    this.runner = new CustomCommandRunner(config);
    this.model = config.model ?? 'custom-command';
  }

  async chat(messages) {
    const prompt = messages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');
    return this.runner.run({ prompt, input: prompt, model: this.model });
  }
}

export function createLlmClient(config, http) {
  return new CustomCommandLlm(config, http);
}