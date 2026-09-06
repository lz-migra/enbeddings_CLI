import { load } from 'cheerio';
import { BaseParser } from './base-parser.js';

export class HtmlParser extends BaseParser {
  chunk(source, maxTokens, overlap) {
    const $ = load(source, { decodeEntities: false });
    const blocks = [];
    const roots = $('body').length ? $('body').children().toArray() : $.root().children().toArray();
    for (const element of roots) {
      const text = $.html(element);
      const start = source.indexOf(text);
      if (start < 0 || !text.trim()) continue;
      blocks.push({
        text,
        startLine: source.slice(0, start).split('\n').length,
        endLine: source.slice(0, start + text.length).split('\n').length,
      });
    }
    if (blocks.length === 0 && source.trim()) {
      blocks.push({ text: source, startLine: 1, endLine: source.split('\n').length });
    }
    return this.packBlocks(blocks, maxTokens, overlap);
  }
}