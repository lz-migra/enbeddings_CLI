import { BaseParser, countTokens } from './base-parser.js';

/**
 * Generic fallback parser: fixed-size line windows with overlap.
 * Used for languages without a dedicated parser (go, rust, etc.).
 */
export class GenericParser extends BaseParser {
  chunk(source, maxTokens, overlap) {
    const lines = source.split('\n');
    return this.splitByLines(
      { text: source, startLine: 1 },
      maxTokens,
      overlap
    ).filter((c) => c.content.trim().length > 0 && countTokens(c.content) > 0 && lines.length > 0);
  }
}
