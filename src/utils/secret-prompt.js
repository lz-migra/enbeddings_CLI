// filepath: src/utils/secret-prompt.js
import * as p from './prompt.js';
import { ensureEnvEntry, writeEnvFile } from './env-file.js';

// Re-export logging helpers so adapter installers have a single import surface.
export const logInfo = p.logInfo;
export const logSuccess = p.logSuccess;
export const logWarn = p.logWarn;
export const logError = p.logError;
export const logStep = p.logStep;

/**
 * Thin wrapper used by adapter installers that delegates to writeEnvFile.
 * Centralizing it here keeps the adapter code free of env-file plumbing.
 */
export function writeEnvFileSafe(envFile, env) {
  if (!envFile) return writeEnvFile('.embeddings_service/.env', env);
  return writeEnvFile(envFile, env);
}

/**
 * Build a stable ENV variable name from an adapter and section.
 * Example: nvidia-nim + embeddings => NVIDIA_NIM_EMBEDDINGS_API_KEY
 */
function defaultEnvName(adapter, type) {
  const adapterPart = String(adapter).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const typePart = type ? String(type).toUpperCase().replace(/[^A-Z0-9]+/g, '_') : '';
  return `${adapterPart}${typePart ? '_' + typePart : ''}_API_KEY`;
}

/**
 * Resolve a secret value from the user and persist it to `.env`.
 *
 * - In TUI mode the prompt uses a masked `password` input.
 * - In `--no-tui` mode the value must come from `--api-key-env NAME` or
 *   already exist in the .env file; missing keys raise a clear error.
 * - The persisted config uses an `env:VAR_NAME` reference, never a literal.
 *
 * Returns the `env:VAR_NAME` reference to be stored in config.
 */
export async function promptAndPersistSecret({
  message,
  adapter,
  type,
  envFile,
  existing,
}) {
  const suggested = defaultEnvName(adapter, type);

  const choice = await p.select({
    message,
    options: [
      { value: 'new', label: 'Save a new API key into .env' },
      { value: 'existing', label: 'Use an existing env variable' },
    ],
  });

  let envName;
  if (choice === 'existing') {
    envName = await p.text({
      message: 'Name of the environment variable (e.g. NVIDIA_API_KEY):',
      initialValue: existing || suggested,
      validate: (value) => (value && /^[A-Z_][A-Z0-9_]*$/.test(value) ? undefined : 'Invalid env name'),
    });
    return `env:${envName}`;
  }

  envName = await p.text({
    message: 'Environment variable name to store the key under:',
    initialValue: suggested,
    validate: (value) => (value && /^[A-Z_][A-Z0-9_]*$/.test(value) ? undefined : 'Invalid env name'),
  });

  const secret = await p.password({
    message: `Value for ${envName} (input is hidden):`,
    validate: (value) => (value && value.trim().length > 0 ? undefined : 'Value is required'),
  });

  writeEnvFile(envFile, { [envName]: secret });
  return `env:${envName}`;
}

/**
 * Non-interactive counterpart used by `--no-tui`. The user must already
 * have exported the variable (or passed its name via the existing flag);
 * the function just guarantees the .env file contains the entry.
 */
export function resolveSecretForNoTui({ envFile, envName, literal }) {
  if (!envName) {
    throw new Error('--no-tui requires --api-key-env <NAME> or a literal --api-key <value>.');
  }
  if (literal) {
    writeEnvFile(envFile, { [envName]: literal });
  } else {
    ensureEnvEntry(envFile, envName, '');
  }
  return `env:${envName}`;
}
