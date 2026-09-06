import { spawn } from 'node:child_process';

function replacePlaceholders(command, values) {
  return command.replace(/\{(prompt|input|model)\}/g, (_match, key) => values[key] ?? '');
}

function extractOutput(output, filter) {
  const text = output.trim();
  if (!filter) return text;

  let match;
  try {
    match = new RegExp(filter, 's').exec(text);
  } catch (error) {
    throw new Error(`Invalid output_filter_regex: ${error.message}`);
  }
  if (!match) throw new Error('Command output did not match output_filter_regex');
  return (match[1] ?? match[0]).trim();
}

export class CustomCommandRunner {
  constructor(config) {
    this.command = config.command;
    this.timeoutMs = config.timeout_ms ?? 30000;
    this.useStdin = config.use_stdin ?? true;
    this.outputFilterRegex = config.output_filter_regex;
  }

  run({ prompt = '', input = prompt, model = '', stdin = null } = {}) {
    const command = replacePlaceholders(this.command, { prompt, input, model });
    const inputData = stdin ?? (this.useStdin ? input : null);

    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish(reject, new Error(`Custom command timed out after ${this.timeoutMs} ms`));
      }, this.timeoutMs);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.stdin.on('error', (error) => {
        if (error.code !== 'EPIPE') finish(reject, new Error(`Failed to write to custom command stdin: ${error.message}`));
      });
      child.on('error', (error) => finish(reject, new Error(`Custom command failed to start: ${error.message}`)));
      child.on('close', (code, signal) => {
        if (settled) return;
        if (code !== 0) {
          const details = stderr.trim() ? `: ${stderr.trim().slice(0, 1000)}` : '';
          finish(reject, new Error(`Custom command exited with code ${code}${details}`));
          return;
        }
        if (signal) {
          finish(reject, new Error(`Custom command terminated by ${signal}`));
          return;
        }
        try {
          finish(resolve, extractOutput(stdout, this.outputFilterRegex));
        } catch (error) {
          finish(reject, error);
        }
      });

      if (inputData !== null && inputData !== undefined) child.stdin.end(String(inputData));
      else child.stdin.end();
    });
  }
}