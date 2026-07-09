# Browser RAG

A fully local, private Retrieval-Augmented Generation (RAG) system running entirely within your web browser. This application keeps all document parsing, text chunking, embedding generation, vector database search, and large language model (LLM) inference on the client side. No data leaves your machine.

## Key Features

- **Multi-Project Workspaces**: Create isolated project environments, each configured with its own dedicated, locked embedding model to ensure vector consistency.
- **Off-Thread Processing**: Document parsing, chunking, embedding generation, and vector retrieval are executed inside Web Workers to keep the main React UI thread responsive and smooth.
- **Client-Side Text Extraction**: Extract text from `.txt`, `.md`, `.json`, `.csv`, `.html`, and `.pdf` files. PDF parsing is powered locally by `@llamaindex/liteparse-wasm` without remote server dependencies.
- **Hybrid Search & Fusion**: Fuses semantic vector search (using pgvector) with keyword full-text search (OR term matching, ranked by `ts_rank`), then merges both lists with Reciprocal Rank Fusion (RRF).
- **Local Embedding Provider**: Uses Transformers.js (ONNX Runtime Web) to run embedding models locally, leveraging WebGPU acceleration when available, with WebAssembly as a fallback.
- **In-Browser Vector Database**: Runs PGlite (a lightweight WebAssembly build of PostgreSQL) with the pgvector extension, utilizing IndexedDB for local storage persistence.
- **Selectable Local LLM Engines**: Stream responses from multiple local models using WebLLM, Transformers.js, Gemma-4-kernel, and LFM2-kernel. Supports deep reasoning "thinking" processes.
- **Multi-Turn Chat**: Conversation memory across turns, with LLM query rewriting that turns follow-ups into standalone search queries for better retrieval.
- **Traceable Citations**: Generated responses include interactive citation tooltips linking back to source document chunks.
- **Retrieval Debug Panel**: Toggleable per-answer debug view with user vs rewritten query, semantic hits, keyword hits, RRF final ranking, settings, and stage timings.
- **Document Chunk Explorer**: Preview indexed chunks per document, including token counts, page numbers, and heading paths.
- **Failed Index Retry**: Failed uploads show error details and can be retried from the stored original file.
- **Diagnostics & Insights**: Real-time monitoring of browser capabilities (WebGPU, Web Workers, IndexedDB, WASM multi-threading) and PGlite database statistics (schema versions, table row counts).

## Tech Stack

- **Frontend Framework**: React 19, TypeScript (Strict Mode)
- **Routing & State**: TanStack Router, TanStack Query
- **Styling**: Tailwind CSS v4, shadcn/ui components (Lucide React)
- **Embeddings & Inference**: Transformers.js, WebLLM
- **PDF Extraction**: `@llamaindex/liteparse-wasm`
- **Database**: PGlite with pgvector and IndexedDB persistence

## Getting Started

### Development

To start the local Vite development server:

```bash
pnpm dev
```

### Production Build

To compile the application and bundle assets:

```bash
pnpm build
```

To preview the built production site locally:

```bash
pnpm preview
```
