import crypto from 'node:crypto';
import fs from 'node:fs';

export function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function uuid() {
  return crypto.randomUUID();
}
