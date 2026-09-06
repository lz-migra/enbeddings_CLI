import postcss from 'postcss';
import { BaseParser } from './base-parser.js';

export class CssParser extends BaseParser {
  chunk(source, maxTokens, overlap) {
    const root = postcss.parse(source);
    const blocks = root.nodes.map((node) => ({
      text: node.toString(),
      startLine: node.source.start.line,
      endLine: node.source.end.line,
    })).filter((block) => block.text.trim());
    return this.packBlocks(
      blocks.length ? blocks : [{ text: source, startLine: 1, endLine: source.split('\n').length }],
      maxTokens,
      overlap
    );
  }
}