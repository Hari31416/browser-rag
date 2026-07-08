# Browser RAG Implementation Plan

This plan builds the app described in `overview.md` and `infra.md`: a browser-first RAG application where users can upload files, index them locally, and query them with selectable local LLMs and embedding models.

The app should start with a fully local path as the default. Remote providers can be added behind explicit user configuration, but local browser inference should remain the primary product path.

## Goals

- Let users upload files from the browser
- Extract text, chunk it, embed it, and store it locally
- Let users query indexed content through semantic and keyword retrieval
- Generate answers with citations from retrieved chunks
- Support the same local LLM engines and selectable models used by `/Users/hari/Desktop/sandbox/voice-agent-in-browser`
- Support multiple embedding providers and embedding models through a provider registry
- Keep expensive indexing, embedding, and retrieval work off the React main thread

## Non-Goals

- Do not add Python or Pyodide to the app runtime
- Do not require a backend service for the initial local-first flow
- Do not require API keys for the default experience
- Do not add remote provider dependencies until the local provider contracts are stable
- Do not optimize for mobile until the desktop upload and query path is reliable

## Reference Decisions

Use the existing project decisions from `overview.md` and `infra.md`:

- Vite, React, TypeScript, TanStack Router, and TanStack Query
- Tailwind CSS and shadcn/ui
- Transformers.js for local embeddings
- ONNX Runtime Web through Transformers.js
- WebGPU when available, WASM fallback when needed
- PGlite with IndexedDB persistence
- `@electric-sql/pglite-pgvector` for vector search
- Web Workers for embedding, indexing, search, and hybrid ranking

Mirror these patterns from `voice-agent-in-browser`:

- Model catalog with logical models and engine-specific variants
- Engine adapter registry with uniform load, unload, abort, readiness, and stream methods
- Browser model loading progress surfaced to the UI
- Local storage preferences for selected LLM and model settings
- Lazy loading and stale model unloading to reduce GPU and memory pressure
- COOP and COEP headers for browser ML and threaded WASM support

## Phase 1 Project Baseline

1. Verify the current Vite React TypeScript app runs with `pnpm`.
2. Confirm Tailwind CSS and shadcn/ui are configured.
3. Confirm TanStack Router and TanStack Query are installed or add them if missing.
4. Confirm PGlite and pgvector packages are installed or add them if missing.
5. Add browser ML headers to Vite dev server and production config:

```txt
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

6. Create the initial app route structure:

```txt
src/routes/
  __root.tsx
  index.tsx
  documents.tsx
  search.tsx
  settings.tsx
  diagnostics.tsx
```

7. Create base layout components:

```txt
src/components/layout/
  app-shell.tsx
  sidebar.tsx
  top-bar.tsx
```

8. Add a settings route early, because provider selection affects indexing and query behavior.

## Phase 2 Database And Persistence

1. Create `src/db/client.ts` for one shared PGlite browser client.
2. Create `src/db/migrations.ts` with idempotent migrations.
3. Enable pgvector during database initialization.
4. Create the core schema:

```txt
collections
documents
chunks
index_jobs
settings
model_cache
query_history
```

5. Store document-level metadata in `documents`:

```txt
id
collection_id
source_type
name
mime_type
size_bytes
created_at
updated_at
status
error_message
metadata_json
```

6. Store chunk-level retrieval data in `chunks`:

```txt
id
document_id
chunk_index
text
token_count
embedding_model_id
embedding_provider_id
embedding_dimensions
embedding
metadata_json
created_at
```

7. Add indexes for document lookup, chunk lookup, keyword search, and vector search.
8. Keep embedding provider and model ids on each chunk so future reindexing can coexist with old embeddings.
9. Add a migration version table so schema changes are explicit and recoverable.

## Phase 3 File Upload And Text Extraction

1. Build an upload panel in `src/components/documents/upload-panel.tsx`.
2. Support initial file types:

- `.txt`
- `.md`
- `.json`
- `.csv`
- `.html`
- `.pdf`

3. Add drag-and-drop and native file picker flows.
4. Extract text in the browser without sending file contents to a server.
5. Normalize extracted text:

- Preserve paragraph boundaries
- Remove excessive repeated whitespace
- Preserve filenames and source metadata
- Keep enough structure for citations

6. Create one `document` row per uploaded file before chunking starts.
7. Surface extraction errors in the document list and diagnostics page.

## Phase 3A PDF Extraction Strategy

Start with browser-native PDF text extraction. Do not add server-side PDF processing for the MVP.

Use `@llamaindex/liteparse-wasm` for PDF extraction.

- It is purpose-built for browser and edge WASM PDF parsing.
- It accepts `Uint8Array` input directly from `File.arrayBuffer()`.
- It can return plain text, Markdown, or JSON with page and spatial structure.
- It keeps parsing local and has no required cloud service.
- It is smaller and more focused than full PDF manipulation libraries.
- Browser OCR is not built in; scanned PDFs need a separate OCR engine callback later.

Implementation steps:

1. Add a `PdfExtractor` abstraction in `src/rag/extractors/pdf.ts`.
2. Keep the app-level extraction API provider-neutral:

```ts
export interface TextExtractionResult {
  text: string
  pages?: ExtractedPage[]
  metadata?: Record<string, unknown>
}
```

3. Implement PDF extraction with `@llamaindex/liteparse-wasm`.
4. Run PDF extraction in `indexing.worker.ts`.
5. Return page-level metadata so citations can include page numbers.
6. Detect text-sparse PDFs and report that OCR is required.
7. Add a future OCR hook, but do not add OCR to the first PDF milestone.
8. Add sample PDFs to manual testing:

- text-only PDF
- multi-page PDF
- two-column PDF
- scanned PDF that should produce an OCR-required warning
- password-protected PDF that should produce a clear error

## Phase 4 Chunking Pipeline

1. Create `src/rag/chunking.ts`.
2. Start with a token-aware or character-estimated chunker:

- Target size: 300 to 800 tokens
- Overlap: 50 to 120 tokens
- Preserve headings when possible
- Prefer paragraph boundaries over fixed-length splits

3. Add chunk metadata:

```txt
source filename
heading path
chunk start offset
chunk end offset
page number if available
section title if available
```

4. Make chunking deterministic for repeatable indexing.
5. Move chunking into `src/workers/indexing.worker.ts` once the synchronous version is proven.
6. Add tests for text normalization and chunk boundary behavior.

## Phase 5 Embedding Provider Architecture

1. Create a provider-independent embedding contract in `src/rag/embedding-provider.ts`:

```ts
export interface EmbeddingProvider {
  id: string
  displayName: string
  load(modelId: string): Promise<void>
  unload(): Promise<void>
  embedTexts(texts: string[], options?: EmbedOptions): Promise<EmbeddingResult[]>
  embedQuery(text: string, options?: EmbedOptions): Promise<EmbeddingResult>
}
```

2. Create an embedding model catalog in `src/rag/embedding-models.ts`.
3. Store these fields per model:

```txt
id
providerId
engine
modelId
displayName
dimensions
maxInputTokens
requiresPrefix
queryPrefix
passagePrefix
normalize
defaultPooling
browserSupport
```

4. Add a provider registry in `src/rag/embedding-runtime.ts`.
5. The registry should expose:

- `getEmbeddingProvider(providerId)`
- `loadEmbeddingModel(modelConfig)`
- `embedDocuments(chunks, modelConfig)`
- `embedQuery(query, modelConfig)`
- `unloadEmbeddingModel()`

6. Persist selected embedding provider and model in app settings.
7. Make the embedding model part of the index identity. If the user changes embedding models, show that documents need reindexing.

## Phase 6 Initial Embedding Providers

1. Implement `transformers-js` as the default embedding provider.
2. Add these local browser embedding models first:

- `Supabase/gte-small`
- `Xenova/all-MiniLM-L6-v2`
- E5-small compatible ONNX model, with query and passage prefixes

3. Use mean pooling and normalized embeddings for cosine search where the model requires it.
4. Add WebGPU-first loading with WASM fallback.
5. Run embedding in `embedding.worker.ts`.
6. Batch embedding requests so large uploads do not freeze the UI.
7. Add progress events:

- model loading
- file extraction
- chunking
- batch embedding
- database writes
- completion or failure

8. Add cancellation through `AbortController`.
9. Add a diagnostics panel showing provider, model id, dimensions, backend, and browser support.

## Phase 7 Optional Remote Embedding Providers

Add these only behind explicit user configuration because they send text outside the browser:

- OpenAI-compatible embeddings
- Cohere embeddings
- Voyage embeddings
- Hugging Face Inference API embeddings

Implementation steps:

1. Reuse the same `EmbeddingProvider` interface.
2. Add a provider type field:

```txt
local
remote
```

3. Add settings UI for endpoint, API key, model id, and dimensions.
4. Store secrets only if the user explicitly opts in.
5. Clearly label remote providers as non-local.
6. Add request batching, retry behavior, and explicit error messages.
7. Require the user to reindex documents when switching between incompatible embedding dimensions.

## Phase 8 LLM Provider Architecture

1. Create `src/llm/llm-models.ts`.
2. Mirror the logical model plus variant catalog from `voice-agent-in-browser`.
3. Create `src/llm/llm-runtime.ts` with a uniform engine adapter:

```ts
export interface LLMEngineAdapter {
  load(modelId: string): Promise<void>
  unload(): Promise<void>
  isReady(): boolean
  abort(): void
  stream(request: LLMStreamRequest): AsyncIterable<LLMStreamEvent>
}
```

4. Create adapters for:

- `transformers-js`
- `webllm`
- `gemma4-kernel`
- `lfm2-kernel`

5. Keep answer generation isolated from retrieval. The RAG orchestrator should pass selected chunks into the LLM adapter, not depend on a specific LLM implementation.
6. Add model load progress, abort, and unload behavior.
7. Persist selected LLM model and variant in settings.
8. Add a model selector UI grouped by engine, family, size, and browser requirements.

## Phase 9 Supported LLM Engines And Models

Support every model exposed by the sibling project catalog.

For `transformers-js`:

- `onnx-community/Qwen3.5-0.8B-ONNX-OPT`
- `onnx-community/Qwen3.5-2B-ONNX-OPT`
- `onnx-community/Qwen3.5-4B-ONNX-OPT`
- `onnx-community/gemma-4-E2B-it-ONNX`
- `LiquidAI/LFM2.5-230M-ONNX`
- `LiquidAI/LFM2.5-350M-ONNX`

For `webllm`:

- `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`
- `Llama-3.2-1B-Instruct-q4f16_1-MLC`
- `gemma-2-2b-it-q4f16_1-MLC`
- `Llama-3.2-3B-Instruct-q4f16_1-MLC`

For `gemma4-kernel`:

- `google/gemma-4-E2B-it-qat-mobile-transformers`

For `lfm2-kernel`:

- `LiquidAI/LFM2.5-230M-GGUF`
- `LiquidAI/LFM2.5-350M-GGUF`

Do not expose undocumented WebLLM models in the first pass unless the catalog intentionally adds them.

## Phase 10 Retrieval Pipeline

1. Create `src/rag/retrieval.ts`.
2. Implement semantic search with pgvector.
3. Implement keyword search for exact matches.
4. Add hybrid result fusion:

- Start with Reciprocal Rank Fusion
- Keep vector and keyword scores available for diagnostics
- Add configurable top-k values

5. Add metadata filters:

- collection
- document
- source type
- date
- embedding model

6. Run retrieval in `retrieval.worker.ts`.
7. Return retrieval results with citations:

```txt
document id
document name
chunk id
chunk index
text preview
score
retrieval source
metadata
```

8. Add a retrieval preview panel so users can inspect which chunks will be sent to the LLM.

## Phase 11 Query And Answer Flow

1. Build a query page in `src/routes/search.tsx`.
2. Query flow:

- User enters a question
- Embed the query with the selected embedding model
- Run vector retrieval
- Run keyword retrieval
- Fuse and rerank results
- Build a prompt with selected chunks
- Stream the answer from the selected LLM
- Render citations linked to source chunks

3. Add a prompt builder in `src/rag/prompt.ts`.
4. Keep the answer prompt compact to fit browser LLM context windows.
5. Include citation markers in the generated answer.
6. Add an option to answer from retrieved context only.
7. Add a no-results state that explains whether the issue is indexing, retrieval, or model loading.

## Phase 12 UI Surfaces

Build these screens in order:

1. Home screen with upload and query entry points.
2. Documents screen with upload progress, document status, and delete actions.
3. Search screen with query input, streamed answer, citations, and retrieved chunks.
4. Settings screen with LLM and embedding model selectors.
5. Diagnostics screen with browser capability checks, model loading status, database stats, and recent errors.

Use compact shadcn/ui components:

- buttons
- cards
- dialogs
- progress bars
- tabs
- select controls
- tables
- toast notifications

## Phase 13 Settings And Preferences

1. Create `src/lib/preferences.ts`.
2. Persist:

- selected LLM model id
- selected LLM variant id
- selected embedding provider id
- selected embedding model id
- chunk size
- chunk overlap
- retrieval top-k
- hybrid retrieval enabled
- remote provider settings if enabled

3. Store non-secret preferences in local storage.
4. Store durable app settings in PGlite when they affect indexing or retrieval.
5. Show a reindex warning when settings change in a way that invalidates existing embeddings.

## Phase 14 Worker Protocol

1. Define typed worker messages in `src/workers/protocol.ts`.
2. Use discriminated unions for worker requests and events.
3. Support these worker operations:

- load embedding model
- index document
- cancel index job
- embed query
- retrieve chunks
- run diagnostics

4. Keep LLM streaming on the main app side initially unless a specific engine requires worker isolation.
5. Add cleanup paths for aborted jobs and unloaded models.

## Phase 15 Testing

1. Add unit tests for:

- text extraction helpers
- text normalization
- chunking
- embedding model catalog validation
- LLM model catalog validation
- prompt construction
- retrieval result fusion

2. Add integration tests for:

- document insert and chunk insert
- settings persistence
- reindex-required detection

3. Add browser manual test cases:

- upload one Markdown file
- upload multiple text files
- upload a text-based PDF and verify page citations
- upload a scanned PDF and verify the OCR-required warning
- switch embedding model and see reindex warning
- query indexed content
- switch LLM variant and stream an answer
- cancel indexing
- delete a document and verify chunks are removed

## Phase 16 Delivery Milestones

Milestone 1: Local document indexing

- Upload `.txt`, `.md`, and `.pdf`
- Extract text
- Chunk text
- Store documents and chunks in PGlite
- Show indexing progress

Milestone 2: Local embeddings

- Load `Supabase/gte-small`
- Embed chunks in a worker
- Store pgvector embeddings
- Embed user queries

Milestone 3: Retrieval

- Vector search
- Keyword search
- Hybrid fusion
- Retrieval diagnostics

Milestone 4: RAG answers

- Add LLM catalog
- Add engine adapters
- Support sibling project LLM engines and models
- Stream answers with citations

Milestone 5: Provider settings

- Embedding provider selector
- LLM selector
- Reindex warnings
- Browser compatibility diagnostics

Milestone 6: Provider expansion

- Add additional local embedding models
- Add optional remote embedding providers if desired
- Add import support for more file types

## Implementation Order

1. Stabilize database initialization and migrations.
2. Build upload and document list UI.
3. Implement text extraction for simple text formats.
4. Implement PDF extraction with `@llamaindex/liteparse-wasm`.
5. Implement chunking and document indexing jobs.
6. Add the local Transformers.js embedding provider.
7. Add pgvector storage and query embedding.
8. Implement vector search.
9. Add keyword search and hybrid fusion.
10. Build the search UI with retrieval preview.
11. Add the LLM catalog and adapter registry.
12. Add the first LLM engine path from the sibling project.
13. Add remaining LLM engines and variants.
14. Add streamed RAG answer generation with citations.
15. Add embedding provider settings and reindex warnings.
16. Add diagnostics, cancellation, and error recovery.
17. Add tests around catalog validation, chunking, PDF extraction, retrieval, and settings.

## Settled Decisions

- Remote embedding providers are deferred until the local path is polished.
- PDF extraction uses `@llamaindex/liteparse-wasm` for now.
- OCR is deferred. When added, OCR should be local-only with a browser OCR engine.
- LLM generation should follow the same engine-specific loading and streaming patterns as `voice-agent-in-browser`.
- The initial UI should emphasize search first, with upload and document management supporting that flow.

## Acceptance Criteria

- A user can upload at least `.txt`, `.md`, and text-based `.pdf` files.
- The app extracts text and indexes chunks locally.
- PDF chunks preserve page metadata for citations where available.
- The selected embedding model is visible in settings and stored with chunks.
- A user can query uploaded content.
- Retrieval returns relevant chunks with source citations.
- A selected local LLM streams an answer from retrieved context.
- The LLM selector includes all cataloged engines and models from `voice-agent-in-browser`.
- The embedding selector supports multiple local models and is designed for multiple providers.
- Indexing, embedding, and retrieval work does not block the main UI.
- The app clearly reports model loading, indexing progress, retrieval status, and errors.
