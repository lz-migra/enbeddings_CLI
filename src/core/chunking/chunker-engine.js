import path from 'node:path';
import fs from 'node:fs';
import { TypeScriptParser } from './parsers/typescript-parser.js';
import { JavaScriptParser } from './parsers/javascript-parser.js';
import { PythonParser } from './parsers/python-parser.js';
import { GoParser } from './parsers/go-parser.js';
import { RustParser } from './parsers/rust-parser.js';
import { HtmlParser } from './parsers/html-parser.js';
import { CssParser } from './parsers/css-parser.js';
import { GenericParser } from './parsers/generic-parser.js';
import { isMinifiedFile, hasEmbeddedBinary } from '../../utils/file-system.js';

const EXTENSION_PARSERS = new Map([
  ['.ts', TypeScriptParser],
  ['.tsx', TypeScriptParser],
  ['.js', JavaScriptParser],
  ['.jsx', JavaScriptParser],
  ['.mjs', JavaScriptParser],
  ['.cjs', JavaScriptParser],
  ['.py', PythonParser],
  ['.go', GoParser],
  ['.rs', RustParser],
  ['.html', HtmlParser],
  ['.css', CssParser],
]);

export function registerParser(extensions, Parser) {
  for (const extension of extensions) {
    EXTENSION_PARSERS.set(extension.toLowerCase(), Parser);
  }
}

/**
 * AST-aware chunking engine: picks a language parser and segments the file
 * into token-bounded chunks with overlap.
 */
export class ChunkerEngine {
  constructor({ maxChunkSize = 512, overlap = 50 } = {}) {
    this.maxChunkSize = maxChunkSize;
    this.overlap = overlap;
  }

  async chunkFile(filePath) {
    if (isMinifiedFile(filePath) || hasEmbeddedBinary(filePath)) {
      return [];
    }
    const source = fs.readFileSync(filePath, 'utf8');
    const Parser = EXTENSION_PARSERS.get(path.extname(filePath).toLowerCase()) ?? GenericParser;
    const parser = new Parser();
    return await parser.chunk(source, this.maxChunkSize, this.overlap);
  }
}
