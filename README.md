# Browser RAG

> [!WARNING]
> This project is a Work in Progress (WIP). Features, APIs, and documentation are subject to change.

A fully local, private Retrieval-Augmented Generation (RAG) system running entirely within your web browser. This application keeps all document parsing, text chunking, embedding generation, vector database search, and large language model (LLM) inference on the client side. No data leaves your machine.

## Key Features

- **Local Inference**: Runs embedding models and LLM generation directly inside the browser using WebGPU acceleration with WASM fallback.
- **In-Browser Vector Database**: Uses PGlite (a lightweight WebAssembly build of PostgreSQL) with the pgvector extension for local vector and keyword search.
- **Secure and Private**: Keep your sensitive documents safe. No server uploads, no remote API calls for local models, and no third-party tracking.
- **Dynamic Routing**: Instant responsive UI using React, TanStack Router, and TanStack Query.
- **Advanced Diagnostics**: Track WebGPU capability, DB stats, memory usage, and loading progress of local AI engines.

## Tech Stack

- **Frontend Framework**: React 19, TypeScript (Strict Mode)
- **Routing & State**: TanStack Router, TanStack Query
- **Styling**: Tailwind CSS v4, shadcn/ui components
- **Embeddings**: Transformers.js with Hugging Face models (e.g., Supabase/gte-small)
- **Database**: PGlite with pgvector and IndexedDB persistence
- **Inference Engines**: WebLLM, Transformers.js, Gemma-4-kernel, and LFM2-kernel

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
