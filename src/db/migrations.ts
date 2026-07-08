import type { PGlite } from '@electric-sql/pglite'

export interface Migration {
  version: number
  sql: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      -- Enable vector extension
      CREATE EXTENSION IF NOT EXISTS vector;

      -- Create projects table — each project has a locked embedding model
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        embedding_model_id TEXT NOT NULL,
        chunk_size INTEGER DEFAULT 500,
        chunk_overlap INTEGER DEFAULT 100,
        retrieval_top_k INTEGER DEFAULT 5,
        hybrid_retrieval_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create collections table
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create documents table
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT,
        size_bytes INTEGER,
        status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        error_message TEXT,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create chunks table
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        embedding_model_id TEXT NOT NULL,
        embedding_provider_id TEXT NOT NULL,
        embedding_dimensions INTEGER NOT NULL,
        embedding vector,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create index_jobs table
      CREATE TABLE IF NOT EXISTS index_jobs (
        id TEXT PRIMARY KEY,
        document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
        status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        progress REAL DEFAULT 0.0,
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create settings table
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create model_cache table
      CREATE TABLE IF NOT EXISTS model_cache (
        model_id TEXT PRIMARY KEY,
        engine TEXT NOT NULL,
        size_bytes BIGINT,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create query_history table
      CREATE TABLE IF NOT EXISTS query_history (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        query TEXT NOT NULL,
        answer TEXT,
        retrieved_chunks_json TEXT,
        embedding_model_id TEXT NOT NULL,
        llm_model_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create index for documents lookup
      CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_id);
      CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);

      -- Create index for chunks lookup
      CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_doc_index ON chunks(document_id, chunk_index);

      -- Create index for query history lookup
      CREATE INDEX IF NOT EXISTS idx_query_history_project ON query_history(project_id);

      -- Create text search indexes (lexical search using tsvector)
      CREATE INDEX IF NOT EXISTS idx_chunks_text_search ON chunks USING gin(to_tsvector('english', text));
    `,
  },
]

export async function runMigrations(db: PGlite): Promise<void> {
  // Ensure the migration versions table exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS migration_versions (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Query applied migrations
  const res = await db.query<{ version: number }>(
    'SELECT version FROM migration_versions ORDER BY version ASC'
  )
  const appliedVersions = new Set(res.rows.map((row) => row.version))

  // Run pending migrations in transaction
  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      await db.transaction(async (tx) => {
        await tx.exec(migration.sql)
        await tx.query(
          'INSERT INTO migration_versions (version) VALUES ($1)',
          [migration.version]
        )
      })
    }
  }
}
