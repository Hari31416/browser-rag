# Browser-Only RAG Overview

This project explores a fully browser-based Retrieval-Augmented Generation
(RAG) system. The goal is to keep indexing, embedding, retrieval, and local
storage inside the browser as much as possible, building on prior experience
with browser-based LLM, TTS, and STT inference through ONNX and Transformers.js.

## Recommended Architecture

The strongest starting point is:

- Embeddings: `@huggingface/transformers`
- Runtime: ONNX Runtime Web through Transformers.js
- Acceleration: WebGPU when available, WASM fallback otherwise
- Local database: `PGlite`
- Vector search: `@electric-sql/pglite-pgvector`
- Persistence: IndexedDB through PGlite's `idb://` storage
- Background work: Web Workers for embedding, indexing, and search

This validates the preliminary idea of running embedding models through
ONNX/Transformers.js and storing vectors in PGlite with pgvector.

## Embedding Models

Good browser-friendly embedding model choices include:

- `Supabase/gte-small`: 384 dimensions, strong quality for its size.
- `Xenova/all-MiniLM-L6-v2`: 384 dimensions, fast and widely used.
- E5-small compatible ONNX variants: useful for retrieval, but require correct
  query/passsage text prefixes.

For a first prototype, `Supabase/gte-small` is a practical default. Use mean
pooling and normalized embeddings for cosine search.

## Database And Vector Search

PGlite is a good fit because it runs Postgres in the browser and can persist to
IndexedDB. With the pgvector extension, it can store vectors alongside normal
relational metadata and run nearest-neighbor search.

Typical tables:

- `documents`: source-level metadata such as title, URL, and source type.
- `chunks`: chunk text, chunk order, metadata, token count, and embedding.

This makes it easy to combine semantic search with metadata filters such as
document type, source URL, timestamps, tags, or user-defined collections.

## Retrieval Strategy

Do not rely only on vector search. A useful browser RAG system should support
hybrid retrieval:

- Vector search for semantic similarity.
- Keyword search for exact names, ids, filenames, rare terms, dates, and code
  symbols.
- Result fusion with Reciprocal Rank Fusion or a simple weighted score.

This improves retrieval quality for practical user queries.

## Alternative: SQLite And sqlite-vec

`sqlite-vec` is a promising alternative if a lighter SQLite-based stack is
preferred. It supports vector search through SQLite and can run in WASM.

The main browser limitation is that SQLite WASM cannot dynamically load
extensions, so `sqlite-vec` must be statically compiled into a custom SQLite
WASM build. Because of that, PGlite plus pgvector is currently the more
straightforward browser application path.

## Small-Corpus Shortcut

For a very small MVP, a database may not be necessary. A simpler version can
store chunks and embeddings in IndexedDB and run brute-force cosine search over
`Float32Array` vectors in a Web Worker.

This can work well for hundreds or a few thousand chunks. Move to PGlite once
metadata filtering, durable schema management, larger collections, or future
sync with Postgres becomes important.

## Browser Constraints

Important risks to design around:

- Initial model download size can be large.
- IndexedDB quotas vary across browsers and devices.
- Mobile browsers have tighter memory limits.
- Safari and iOS can be more fragile for local ML workloads.
- Large corpus indexing needs batching, progress reporting, cancellation, and
  resumable work.
- Embedding and database operations should not block the main UI thread.

## Suggested MVP Flow

1. Import documents, pages, notes, or files.
2. Extract text in the browser.
3. Split text into chunks, around 300-800 tokens with modest overlap.
4. Embed chunks in a Web Worker.
5. Store chunks, metadata, and embeddings in PGlite with pgvector.
6. Embed the user query.
7. Retrieve with vector search and optional keyword search.
8. Fuse and rank results.
9. Pass selected chunks to a local or remote LLM.

## Recommendation

Start with `Transformers.js + Supabase/gte-small + PGlite + pgvector`. This is
the best balance of browser-only operation, implementation practicality, and a
future path toward richer local-first RAG features.
