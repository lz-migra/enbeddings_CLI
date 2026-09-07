import {
  RRF_K,
  SUBQUERY_TOP_K,
  DEFAULT_LIMIT,
  AUTO_LIMIT_MAX,
  AUTO_MIN_SIMILARITY,
  AUTO_SCORE_DROP_RATIO,
  AUTO_SCORE_DROP_DELTA,
} from '../../config/constants.js';

/**
 * Selects relevant RRF entries without making an automatic result set grow
 * indefinitely. Entries are already ordered by RRF score.
 */
export function applyDynamicLimit(
  entries,
  limit = DEFAULT_LIMIT,
  {
    maxResults = AUTO_LIMIT_MAX,
    minSimilarity = AUTO_MIN_SIMILARITY,
    scoreDropRatio = AUTO_SCORE_DROP_RATIO,
    scoreDropDelta = AUTO_SCORE_DROP_DELTA,
  } = {}
) {
  if (limit !== 'auto') {
    const numericLimit = typeof limit === 'number' ? limit : Number(limit);
    if (!Number.isInteger(numericLimit) || numericLimit < 0) {
      throw new Error(`Invalid limit "${limit}". Use a non-negative integer or "auto".`);
    }
    return entries.slice(0, numericLimit);
  }

  const relevant = entries.filter((entry) => entry.bestSimilarity >= minSimilarity);
  const selected = [];
  for (const entry of relevant) {
    if (selected.length >= maxResults) break;
    const previous = selected[selected.length - 1];
    if (previous) {
      const scoreDroppedAbruptly =
        entry.rrf <= previous.rrf * scoreDropRatio ||
        previous.bestSimilarity - entry.bestSimilarity >= scoreDropDelta;
      if (scoreDroppedAbruptly) break;
    }
    selected.push(entry);
  }
  return selected;
}

/**
 * Query flow orchestrator: decomposition -> embed (query mode) -> KNN per
 * sub-query -> Reciprocal Rank Fusion -> top N.
 */
export class QueryEngine {
  constructor({ repository, embeddingsEngine, decomposer }) {
    this.repo = repository;
    this.engine = embeddingsEngine;
    this.decomposer = decomposer;
  }

  validateModel() {
    const stored = this.repo.getIndexedModel();
    if (stored && stored !== this.engine.model) {
      throw new Error(
        `Model mismatch: index was built with "${stored}" but config uses "${this.engine.model}".\n` +
          'Run: embeddings-service index --reindex --force'
      );
    }
  }

  /**
   * @param {string} prompt
   * @param {{ decompose?: boolean, limit?: number|string, roots?: string[]|null }} opts
   *   roots: absolute project root dirs to restrict results to; null = search everything.
   * @returns {{ queries: string[], results: Array }}
   */
  async search(prompt, { decompose = true, limit = DEFAULT_LIMIT, roots = null } = {}) {
    this.validateModel();

    const queries = decompose ? await this.decomposer.decompose(prompt) : [prompt];
    const queryEmbeddings = await this.engine.embedQueries(queries);

    // Per-sub-query KNN
    const rankings = queryEmbeddings.map((emb) => this.repo.knn(emb, SUBQUERY_TOP_K, roots));

    // Reciprocal Rank Fusion
    const scores = new Map(); // uuid -> { rrf, best, bestSimilarity }
    rankings.forEach((list) => {
      list.forEach((row, rank) => {
        const entry = scores.get(row.uuid) ?? {
          rrf: 0,
          best: null,
          bestSimilarity: -1,
        };
        entry.rrf += 1 / (RRF_K + rank + 1);
        // vec0 cosine distance -> similarity; fallback repo also returns cosine distance
        const similarity = Math.max(0, Math.min(1, 1 - row.distance));
        if (similarity > entry.bestSimilarity) {
          entry.bestSimilarity = similarity;
          entry.best = row;
        }
        scores.set(row.uuid, entry);
      });
    });

    const rankedEntries = [...scores.values()].sort((a, b) => b.rrf - a.rrf);
    const results = applyDynamicLimit(rankedEntries, limit)
      .map((e) => ({
        uuid: e.best.uuid,
        file_path: e.best.file_path,
        root_dir: e.best.root_dir ?? null,
        start_line: e.best.start_line,
        end_line: e.best.end_line,
        similarity_score: Math.round(e.bestSimilarity * 100) / 100,
        chunk: e.best.content,
      }));

    return { queries, results };
  }
}
