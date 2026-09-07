/**
 * Repository implementing Strategy A (file-level replacement):
 * on change, DELETE all chunks for the file and INSERT fresh ones.
 */
export class EmbeddingsRepository {
  constructor(db, vecAvailable) {
    this.db = db;
    this.vecAvailable = vecAvailable;
  }

  getFileHash(filePath) {
    const row = this.db
      .prepare('SELECT file_hash FROM chunks WHERE file_path = ? LIMIT 1')
      .get(filePath);
    return row?.file_hash ?? null;
  }

  findFileByHash(fileHash, excludePath = null) {
    const row = excludePath
      ? this.db
          .prepare(
            'SELECT file_path FROM chunks WHERE file_hash = ? AND file_path != ? LIMIT 1'
          )
          .get(fileHash, excludePath)
      : this.db
          .prepare('SELECT file_path FROM chunks WHERE file_hash = ? LIMIT 1')
          .get(fileHash);
    return row?.file_path ?? null;
  }

  renameFile(oldPath, newPath) {
    const result = this.db
      .prepare('UPDATE chunks SET file_path = ? WHERE file_path = ?')
      .run(newPath, oldPath);
    return result.changes;
  }

  getIndexedModel() {
    const row = this.db.prepare('SELECT model FROM chunks LIMIT 1').get();
    return row?.model ?? null;
  }

  deleteByFile(filePath) {
    const uuids = this.db
      .prepare('SELECT uuid FROM chunks WHERE file_path = ?')
      .all(filePath)
      .map((r) => r.uuid);
    if (uuids.length === 0) return 0;

    const delChunks = this.db.prepare('DELETE FROM chunks WHERE file_path = ?');
    const vecTable = this.vecAvailable ? 'chunk_vectors' : 'chunk_vectors_fallback';
    const delVec = this.db.prepare(`DELETE FROM ${vecTable} WHERE uuid = ?`);

    const tx = this.db.transaction(() => {
      delChunks.run(filePath);
      for (const id of uuids) delVec.run(id);
    });
    tx();
    return uuids.length;
  }

  insertChunks(chunks) {
    const insertChunk = this.db.prepare(`
      INSERT INTO chunks (uuid, file_path, file_hash, start_line, end_line, content, model, created_at, root_dir)
      VALUES (@uuid, @file_path, @file_hash, @start_line, @end_line, @content, @model, @created_at, @root_dir)
    `);
    const insertVec = this.vecAvailable
      ? this.db.prepare('INSERT INTO chunk_vectors (uuid, embedding) VALUES (?, vec_f32(?))')
      : this.db.prepare('INSERT INTO chunk_vectors_fallback (uuid, embedding) VALUES (?, ?)');

    const tx = this.db.transaction((items) => {
      for (const c of items) {
        insertChunk.run(c);
        if (this.vecAvailable) {
          insertVec.run(c.uuid, Buffer.from(new Float32Array(c.embedding).buffer));
        } else {
          insertVec.run(c.uuid, JSON.stringify(c.embedding));
        }
      }
    });
    tx(chunks);
  }

  /**
   * KNN search. Returns [{uuid, file_path, start_line, end_line, content, distance, root_dir}].
   * @param {number[]} queryEmbedding
   * @param {number} k
   * @param {string[]|null} roots - absolute root dirs to restrict results to; null = no filter.
   */
  knn(queryEmbedding, k, roots = null) {
    if (this.vecAvailable) {
      // vec0 cannot push the root_dir filter into the MATCH clause, so we
      // over-fetch and filter in JS. The factor is generous to keep recall
      // high when only a fraction of the index belongs to the target roots.
      const fetchK = roots ? k * 10 : k;
      const rows = this.db
        .prepare(`
          SELECT c.uuid, c.file_path, c.start_line, c.end_line, c.content, c.root_dir, v.distance
          FROM chunk_vectors v
          JOIN chunks c ON c.uuid = v.uuid
          WHERE v.embedding MATCH vec_f32(?) AND k = ?
          ORDER BY v.distance
        `)
        .all(Buffer.from(new Float32Array(queryEmbedding).buffer), fetchK);
      const filtered = roots ? rows.filter((r) => roots.includes(r.root_dir)) : rows;
      return filtered.slice(0, k);
    }
    return this.#fallbackKnn(queryEmbedding, k, roots);
  }

  #fallbackKnn(queryEmbedding, k, roots = null) {
    const rows = this.db
      .prepare(`
        SELECT c.uuid, c.file_path, c.start_line, c.end_line, c.content, c.root_dir, f.embedding
        FROM chunk_vectors_fallback f
        JOIN chunks c ON c.uuid = f.uuid
      `)
      .all();
    const scored = rows.map((r) => ({
      uuid: r.uuid,
      file_path: r.file_path,
      start_line: r.start_line,
      end_line: r.end_line,
      content: r.content,
      root_dir: r.root_dir,
      distance: 1 - cosineSimilarity(queryEmbedding, JSON.parse(r.embedding)),
    }));
    scored.sort((a, b) => a.distance - b.distance);
    const filtered = roots ? scored.filter((r) => roots.includes(r.root_dir)) : scored;
    return filtered.slice(0, k);
  }

  countChunks() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM chunks').get().n;
  }
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
