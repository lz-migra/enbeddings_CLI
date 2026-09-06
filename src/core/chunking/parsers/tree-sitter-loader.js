import fs from 'node:fs';
import { Parser, Language } from 'web-tree-sitter';
import { getWasmPath } from 'tree-sitter-wasm';

let runtimePromise;
const languagePromises = new Map();

async function runtime() {
  runtimePromise ??= Parser.init();
  await runtimePromise;
  return Parser;
}

export async function loadTreeSitterLanguage(language) {
  if (!languagePromises.has(language)) {
    languagePromises.set(language, (async () => {
      const wasmPath = getWasmPath(language);
      if (!fs.existsSync(wasmPath)) throw new Error(`No WASM grammar for ${language}`);
      await runtime();
      return Language.load(wasmPath);
    })());
  }
  return languagePromises.get(language);
}

export async function parseTree(source, language) {
  const TreeSitter = await runtime();
  const parser = new TreeSitter();
  parser.setLanguage(await loadTreeSitterLanguage(language));
  const tree = parser.parse(source);
  parser.delete();
  return tree;
}

export function nodesToBlocks(root, source, types) {
  const blocks = [];
  const visit = (node) => {
    if (types.has(node.type)) {
      blocks.push({
        text: source.slice(node.startIndex, node.endIndex),
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  if (blocks.length === 0 && source.trim()) {
    blocks.push({ text: source, startLine: 1, endLine: source.split('\n').length });
  }
  return blocks.filter((block) => block.text.trim());
}