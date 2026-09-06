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
      INSERT INTO chunks (uuid, file_path, file_hash, start_line, end_line, content, model, created_at)
      VALUES (@uuid, @file_path, @file_hash, @start_line, @end_line, @content, @model, @created_at)
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

  /** KNN search. Returns [{uuid, file_path, start_line, end_line, content, distance}]. */
  knn(queryEmbedding, k) {
    if (this.vecAvailable) {
      return this.db
        .prepare(`
          SELECT c.uuid, c.file_path, c.start_line, c.end_line, c.content, v.distance
          FROM chunk_vectors v
          JOIN chunks c ON c.uuid = v.uuid
          WHERE v.embedding MATCH vec_f32(?) AND k = ?
          ORDER BY v.distance
        `)
        .all(Buffer.from(new Float32Array(queryEmbedding).buffer), k);
    }
    return this.#fallbackKnn(queryEmbedding, k);
  }

  #fallbackKnn(queryEmbedding, k) {
    const rows = this.db
      .prepare(`
        SELECT c.uuid, c.file_path, c.start_line, c.end_line, c.content, f.embedding
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
      distance: 1 - cosineSimilarity(queryEmbedding, JSON.parse(r.embedding)),
    }));
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, k);
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
