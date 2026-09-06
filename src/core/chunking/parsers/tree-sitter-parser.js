import { BaseParser } from './base-parser.js';

export class TreeSitterParser extends BaseParser {
  constructor(language, nodeTypes, fallback) {
    super();
    this.language = language;
    this.nodeTypes = new Set(nodeTypes);
    this.fallback = fallback;
  }

  async chunk(source, maxTokens, overlap) {
    try {
      const { parseTree, nodesToBlocks } = await import('./tree-sitter-loader.js');
      const tree = await parseTree(source, this.language);
      const blocks = nodesToBlocks(tree.rootNode, source, this.nodeTypes);
      tree.delete();
      return this.packBlocks(blocks, maxTokens, overlap);
    } catch (error) {
      if (!this.fallback) throw error;
      return this.fallback.chunk(source, maxTokens, overlap);
    }
  }
}