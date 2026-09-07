import * as p from '@clack/prompts';

/**
 * Centralized prompt utilities using @clack/prompts.
 * Provides a consistent interface for all interactive CLI flows.
 */

export function intro(message) {
  p.intro(message);
}

export function outro(message) {
  p.outro(message);
}

export function cancel(message = 'Operation cancelled.') {
  p.cancel(message);
  process.exit(0);
}

export function isCancel(value) {
  return p.isCancel(value);
}

export async function text({ message, placeholder, initialValue, validate }) {
  const result = await p.text({ message, placeholder, initialValue, validate });
  if (isCancel(result)) cancel();
  return result;
}

export async function confirm({ message, initialValue = false }) {
  const result = await p.confirm({ message, initialValue });
  if (isCancel(result)) cancel();
  return result;
}

export async function select({ message, options }) {
  const result = await p.select({ message, options });
  if (isCancel(result)) cancel();
  return result;
}

export async function multiselect({ message, options, required = false }) {
  const result = await p.multiselect({ message, options, required });
  if (isCancel(result)) cancel();
  return result;
}

export async function password({ message, mask = '*', validate }) {
  const result = await p.password({ message, mask, validate });
  if (isCancel(result)) cancel();
  return result;
}

export function logInfo(message) {
  p.log.info(message);
}

export function logSuccess(message) {
  p.log.success(message);
}

export function logWarn(message) {
  p.log.warn(message);
}

export function logError(message) {
  p.log.error(message);
}

export function logStep(message) {
  p.log.step(message);
}

export function spinner() {
  return p.spinner();
}

export function progress({ max }) {
  return p.progress({ max });
}
