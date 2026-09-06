import chalk from 'chalk';
import yoctoSpinner from 'yocto-spinner';

/** Latest progress message; used only when no spinner is running. */
let progressText = '';
/** Reference to the active yocto spinner while one is running. */
let progressActiveSpinner = null;
/** Last text rendered to the spinner; used to skip duplicate renders. */
let progressLastRender = '';

function dimIfPossible(msg) {
  return chalk.supportsColor && chalk.supportsColor.level > 0 ? chalk.dim(msg) : msg;
}

/** Logger: colored output using chalk, respecting TTY and NO_COLOR. */
export const logger = {
  info: (msg) => console.log(msg),
  success: (msg) => console.log(chalk.green(msg)),
  warn: (msg) => console.warn(chalk.yellow(`⚠ ${msg}`)),
  error: (msg) => console.error(chalk.red(`✖ ${msg}`)),
  dim: (msg) => console.log(dimIfPossible(msg)),
  step: (msg) => console.log(chalk.cyan(msg)),
  progress: (msg) => {
    progressText = msg;
    if (progressActiveSpinner) {
      if (msg === progressLastRender) return;
      progressLastRender = msg;
      progressActiveSpinner.text = msg;
      return;
    }
    if (!process.stdout.isTTY) return;
    process.stdout.write(dimIfPossible(msg));
  },
  progressEnd: () => {
    progressText = '';
    if (!process.stdout.isTTY) return;
    if (progressActiveSpinner) return;
    process.stdout.write('\n');
  },
};

/** Reads the last progress message reported via `logger.progress`. */
export function getLastProgress() {
  return progressText;
};

/**
 * Run an async operation with a yocto-spinner spinner. Falls back to a plain
 * logger call when stdout is not a TTY so pipe output stays readable.
 *
 * While the spinner is active, `logger.progress` updates the spinner text only
 * when it changes, eliminating the per-frame flicker caused by other libraries
 * (e.g. ora) that repaint the line even when the text is unchanged.
 *
 * @param {string} text Spinner initial text.
 * @param {() => Promise<T>} operation Function returning the operation promise.
 * @param {object} [options] Optional yocto-spinner options.
 * @returns {Promise<T>} Resolves with the operation result on success.
 */
export async function withSpinner(text, operation, options = {}) {
  if (!process.stdout.isTTY) {
    logger.step(text);
    return operation();
  }
  const spinner = yoctoSpinner({ text, color: 'cyan', ...options }).start();
  progressActiveSpinner = spinner;
  progressLastRender = text;
  try {
    const result = await operation();
    spinner.success(`${text} — done`);
    return result;
  } catch (error) {
    spinner.error(`${text} — ${error.message}`);
    throw error;
  } finally {
    progressActiveSpinner = null;
  }
}
