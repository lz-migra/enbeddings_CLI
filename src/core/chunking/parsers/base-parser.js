/**
 * Approximate token counter (~4 chars per token, a common heuristic for code).
 * Avoids a hard dependency on tiktoken while staying close enough for chunking.
 */
export function countTokens(text) {
  return Math.ceil(text.length / 4);
}

export class BaseParser {
  /** Returns array of { content, startLine, endLine } (1-based lines). */
  chunk(_source, _maxTokens, _overlap) {
    throw new Error('Not implemented');
  }

  /** Splits a list of logical blocks into token-bounded chunks with overlap. */
  packBlocks(blocks, maxTokens, overlap) {
    const chunks = [];
    let current = [];
    let currentTokens = 0;

    const flush = () => {
      if (current.length === 0) return;
      chunks.push({
        content: current.map((b) => b.text).join('\n'),
        startLine: current[0].startLine,
        endLine: current[current.length - 1].endLine,
      });
      // Overlap: keep trailing blocks whose combined tokens <= overlap
      if (overlap > 0) {
        const kept = [];
        let keptTokens = 0;
        for (let i = current.length - 1; i >= 0; i--) {
          const t = countTokens(current[i].text);
          if (keptTokens + t > overlap) break;
          kept.unshift(current[i]);
          keptTokens += t;
        }
        current = kept;
        currentTokens = keptTokens;
      } else {
        current = [];
        currentTokens = 0;
      }
    };

    for (const block of blocks) {
      const tokens = countTokens(block.text);
      if (tokens > maxTokens) {
        flush();
        // Split oversized block by lines
        for (const sub of this.splitByLines(block, maxTokens, overlap)) {
          chunks.push(sub);
        }
        continue;
      }
      if (currentTokens + tokens > maxTokens) flush();
      current.push(block);
      currentTokens += tokens;
    }
    flush();
    return chunks;
  }

  splitByLines(block, maxTokens, overlap) {
    const lines = block.text.split('\n');
    const chunks = [];
    let start = 0;
    while (start < lines.length) {
      let end = start;
      let tokens = 0;
      while (end < lines.length) {
        const t = countTokens(lines[end]);
        if (tokens + t > maxTokens && end > start) break;
        tokens += t;
        end++;
      }
      chunks.push({
        content: lines.slice(start, end).join('\n'),
        startLine: block.startLine + start,
        endLine: block.startLine + end - 1,
      });
      // step back by overlap (approximate in lines)
      const overlapLines = Math.max(0, Math.floor((overlap / Math.max(tokens, 1)) * (end - start)));
      start = Math.max(end - overlapLines, start + 1);
      if (start >= lines.length) break;
      if (end >= lines.length) break;
    }
    return chunks;
  }
}
