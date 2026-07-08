# Browser RAG Infrastructure

This project should be built as a browser-first, local-first RAG application.
The stack should optimize for client-side inference, browser storage, Web
Workers, and a clean TypeScript developer experience.

## Chosen App Stack

- Build tool: Vite
- UI runtime: React
- Language: TypeScript
- Routing: TanStack Router
- Async state and cache: TanStack Query
- Styling: Tailwind CSS
- Component system: shadcn/ui
- Embeddings: Transformers.js
- Model runtime: ONNX Runtime Web through Transformers.js
- Database: PGlite
- Vector search: pgvector through `@electric-sql/pglite-pgvector`
- Persistence: IndexedDB through PGlite `idb://` storage
- Background execution: Web Workers

## Explicit Non-Goals

- Do not use Python for the application runtime.
- Do not use Pyodide.
- Do not use Next.js unless the project later requires server-rendered pages,
  server routes, server actions, or SEO-heavy public pages.
- Do not use TanStack Start for the initial version; TanStack Router is enough
  for a browser-only app.

## Why Vite

Vite is the best default for this app because the core workload is browser-side:

- loading embedding models,
- running ONNX/Transformers.js,
- using WebGPU or WASM,
- persisting data to IndexedDB,
- running PGlite in the browser,
- coordinating Web Workers.

A full-stack framework would add server/client boundaries that are not needed
for the initial product.

## UI System

Use Tailwind CSS and shadcn/ui for the interface.

The UI should feel like a dense local tool rather than a marketing site. Favor:

- sidebars for collections and documents,
- command/search surfaces,
- tables for chunk and document inspection,
- tabs for retrieval, documents, settings, and diagnostics,
- dialogs for import and destructive actions,
- progress indicators for indexing,
- compact controls for retrieval parameters.

## Worker Architecture

Use Web Workers for expensive work:

- embedding model loading,
- document chunking,
- batch embedding,
- indexing,
- retrieval scoring,
- optional hybrid ranking.

The main React thread should only coordinate UI state and display progress.

## Data Architecture

Use PGlite with IndexedDB persistence:

```ts
const db = await PGlite.create('idb://browser-rag');
```

Core tables should include:

- `documents`: source metadata.
- `chunks`: chunk text, order, metadata, and vector embedding.
- `collections`: user-created groupings.
- `index_jobs`: progress, errors, and resumable indexing state.
- `settings`: model and retrieval configuration.

Use pgvector for semantic retrieval and add lexical search for exact matching.

## Retrieval Architecture

Initial retrieval should support:

- vector similarity search,
- metadata filtering,
- keyword search,
- hybrid result fusion,
- reranking hooks for future experiments.

Hybrid retrieval is important because vector-only search performs poorly for
exact identifiers, filenames, names, dates, code symbols, and rare terms.

## Recommended Initial Dependencies

Core:

```txt
vite
react
react-dom
typescript
@tanstack/react-router
@tanstack/react-query
@huggingface/transformers
@electric-sql/pglite
@electric-sql/pglite-pgvector
tailwindcss
shadcn/ui
```

Likely useful:

```txt
lucide-react
zod
clsx
tailwind-merge
class-variance-authority
```

## Initial Project Shape

```txt
src/
  app/
    router.tsx
    query-client.ts
  components/
    ui/
    layout/
    retrieval/
    documents/
    settings/
  db/
    client.ts
    migrations.ts
    schema.ts
  workers/
    embedding.worker.ts
    indexing.worker.ts
    retrieval.worker.ts
  rag/
    chunking.ts
    embeddings.ts
    retrieval.ts
    hybrid.ts
  routes/
    __root.tsx
    index.tsx
    documents.tsx
    search.tsx
    settings.tsx
```

## Final Decision

Build the app with Vite, React, TypeScript, TanStack Router, TanStack Query,
Tailwind CSS, and shadcn/ui. Keep the project fully TypeScript-based. Do not
introduce Python or Pyodide into the runtime.
