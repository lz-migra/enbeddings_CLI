// filepath: src/infrastructure/ai-providers/adapters/custom-command/install.js
import * as p from '../../../../utils/secret-prompt.js';

export async function install({ ask, confirm }) {
  p.logStep('Provide the execution details for your local CLI command or subprocess.');

  let command = await ask(
    'Command to execute (e.g. opencode run {prompt}):',
    'opencode run {prompt}'
  );

  // Auto-format {prompt} / {input} if the user didn't wrap it in quotes
  command = command
    .replace(/(?<!["'])\{(prompt|input)\}(?!["'])/g, '"{ $1 }"')
    .replace(/\{\s+(prompt|input)\s+\}/g, '{$1}');

  const timeoutInput = await ask('Timeout in milliseconds:', '10000');
  const use_stdin = await confirm('Pass input/prompt data via stdin?', false);
  const outputFilter = await ask(
    'Optional Regex pattern to extract specific output [Leave empty to skip]:',
    ''
  );

  const timeout_ms = parseInt(timeoutInput, 10);

  p.logSuccess('Configuration completed successfully.');

  return {
    command,
    timeout_ms: Number.isNaN(timeout_ms) ? 10000 : timeout_ms,
    use_stdin,
    ...(outputFilter ? { output_filter_regex: outputFilter } : {}),
  };
}

