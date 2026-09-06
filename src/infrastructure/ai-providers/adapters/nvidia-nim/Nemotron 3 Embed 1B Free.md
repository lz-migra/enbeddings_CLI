# Nemotron-3-Embed-1B — Free Endpoint Reference

| Field | Value |
|---|---|
| **Model identifier** | `nvidia/nemotron-3-embed-1b` |
| **Full name** | Nemotron-3-Embed-1B-BF16 |
| **Endpoint URL** | `POST https://integrate.api.nvidia.com/v1/embeddings` |
| **API format** | OpenAI-compatible (`/v1/embeddings`) |
| **Auth** | `Authorization: Bearer $NVIDIA_API_KEY` |
| **Free tier** | Yes — labeled "Free Endpoint" on build.nvidia.com |
| **Release date** | 2026-07-16 |
| **API terms** | NVIDIA API Trial Terms of Service |

---

## Input specs (API-level)

| Field | Value |
|---|---|
| **Modality** | Text only |
| **Max input tokens per request** | **4096 tokens** |
| **Input formats accepted** | `string` (single text) or `array` of strings (batch) |
| **`input_type` values** | `passage` (indexing) / `query` (searching) |
| **Note on `input_type`** | Use `passage` when indexing documents, `query` when searching. Mismatched types cause large accuracy drops. |

## Output specs

| Field | Value |
|---|---|
| **Embedding dimension** | **2048** (fixed) |
| **Output type** | Dense vector |
| **`encoding_format`** | `float` (default) / `base64` |
| **Output shape** | 1D per input string |
| **Bytes per vector (float32)** | ~8 KB |
| **Response schema** | OpenAI-compatible (`object`, `data[]`, `model`, `usage`) |

---

## Multilingual support

| Field | Value |
|---|---|
| **Languages** | 34 |
| **List** | English, Arabic, Assamese, Bengali, Bulgarian, Chinese, Danish, Dutch, Finnish, French, German, Hindi, Hinglish, Indonesian, Italian, Japanese, Korean, Malay, Marathi, Nepalese, Norwegian, Persian, Portuguese, Romanian, Russian, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Ukrainian, Urdu, Vietnamese |
| **Cross-lingual retrieval** | Supported |

---

## Performance benchmarks (NDCG@10 @ 4096 tokens)

| Model | RTEB 16 | ViDoRE-V3 text | MMTEB (Retrieval) |
|---|---|---|---|
| llama-nemotron-embed-1b-v2 | 60.47 | 52.10 | 59.58 |
| llama-nemotron-embed-vl-1b-v2 | 61.98 | 52.54 | 59.71 |
| **Nemotron-3-Embed-1B** | **72.38** | **57.76** | **71.05** |

---

## Request body schema

```json
{
  "model": "nvidia/nemotron-3-embed-1b",
  "input": "string | string[]",
  "input_type": "passage | query",
  "encoding_format": "float | base64",
  "truncate": "NONE | START | END",
  "user": "string (ignored — kept for OpenAI API parity)"
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `model` | yes | — | Must be exactly `nvidia/nemotron-3-embed-1b` |
| `input` | yes | — | Single string or array of strings |
| `input_type` | recommended | — | `passage` for indexing, `query` for searching |
| `encoding_format` | no | `float` | `base64` reduces payload for large batches |
| `truncate` | no | `NONE` | `NONE` errors if input exceeds 4096 tokens; `START`/`END` truncates from that side |
| `user` | no | — | Accepted but not implemented; safe to omit |

## Response schema (HTTP 200)

```json
{
  "object": "list",
  "data": [
    { "index": 0, "object": "embedding", "embedding": [0.06473, 0.00074, ..., 0.05355] }
  ],
  "model": "nvidia/nemotron-3-embed-1b",
  "usage": { "prompt_tokens": 0, "total_tokens": 0 }
}
```

---

## Practical notes for the free endpoint

- **Distance metric**: vectors are L2-normalized by convention. Cosine similarity and dot product give equivalent rankings; either works.
- **Batch throughput**: send `input` as `string[]` to amortize round-trip cost. The per-request cap is 4096 tokens.
- **Retrieval asymmetry**: always pass `input_type=passage` when indexing and `input_type=query` when searching. Skipping it costs measurable accuracy.
- **Storage sizing (float32)**: 1 M vectors × 2048 dims × 4 B ≈ 8 GB raw. Plan vector DB capacity accordingly.
- **Transport optimization**: if you batch large indexes, request `encoding_format=base64` to cut payload size ~33%.
- **OpenAI SDK compatibility**: any client that accepts a `base_url` override works. Point it at `https://integrate.api.nvidia.com/v1` and use your NVIDIA key.
- **Reranking**: for higher top-k precision, follow up with `nvidia/llama-nemotron-rerank-1b-v2` on the retrieved candidates.

---

## Things I could not verify on the free endpoint

| Item | Status |
|---|---|
| **Exact RPM / TPM quota** | Not published in the docs I scraped. Check your build.nvidia.com account dashboard after creating the API key. |
| **Latency / throughput** | Not published in the docs. Measure against your own batches. |
| **Matryoshka / MRL truncation** | Not documented. Do not assume dimensional truncation works on the hosted endpoint. |
