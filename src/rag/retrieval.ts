import { getDb, isDbInitialized } from '@/db/client'
import { getEmbeddingProvider } from '@/rag/embedding-runtime'
import { getEmbeddingModelConfig } from '@/rag/embedding-models'

export interface RetrievalResult {
  chunkId: string
  documentId: string
  documentName: string
  chunkIndex: number
  text: string
  score: number
  source: 'vector' | 'keyword' | 'hybrid'
  metadata: {
    startOffset?: number
    endOffset?: number
    pageNumber?: number | null
    headingPath?: string | null
    vectorScore?: number
    keywordScore?: number
    vectorRank?: number
    keywordRank?: number
  }
}

/** Compact hit used in retrieval debug panels. */
export interface RetrievalDebugHit {
  rank: number
  chunkId: string
  documentName: string
  chunkIndex: number
  score: number
  text: string
  pageNumber?: number | null
  vectorRank?: number | null
  keywordRank?: number | null
  vectorScore?: number | null
  keywordScore?: number | null
  source?: 'vector' | 'keyword' | 'hybrid'
}

export interface RetrievalDebugInfo {
  query: string
  hybridEnabled: boolean
  topK: number
  rrfConstant: number
  vectorLimit: number
  keywordLimit: number
  embeddingModelId: string
  documentFilterCount: number | null
  timingMs: {
    embed: number
    vector: number
    keyword: number
    fusion: number
    total: number
  }
  semanticHits: RetrievalDebugHit[]
  keywordHits: RetrievalDebugHit[]
  fusedHits: RetrievalDebugHit[]
}

export interface RetrievalOptions {
  embeddingModelId: string
  projectId?: string
  /** Filter to a single document (legacy). Prefer documentIds for multi-select. */
  documentId?: string
  /** Filter to a set of documents; when empty or undefined, all docs in the project are searched. */
  documentIds?: string[]
  topK?: number
  vectorLimit?: number
  keywordLimit?: number
  hybridEnabled?: boolean
  rrfConstant?: number
}

export interface RetrieveChunksResult {
  results: RetrievalResult[]
  debug: RetrievalDebugInfo
}

function parseMeta(raw: unknown): Record<string, any> {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) || {}
    if (raw && typeof raw === 'object') return raw as Record<string, any>
  } catch {
    // Ignored
  }
  return {}
}

function rowToDebugHit(row: any, rank: number, extras?: Partial<RetrievalDebugHit>): RetrievalDebugHit {
  const meta = parseMeta(row.metadata_json)
  return {
    rank,
    chunkId: row.id,
    documentName: row.document_name,
    chunkIndex: row.chunk_index,
    score: Number(row.score) || 0,
    text: row.text,
    pageNumber: meta.pageNumber ?? null,
    ...extras,
  }
}

export async function retrieveChunks(
  query: string,
  options: RetrievalOptions
): Promise<RetrieveChunksResult> {
  if (!isDbInitialized()) {
    throw new Error('Database not initialized')
  }

  const totalStart = performance.now()
  const db = getDb()

  let hybridEnabled = options?.hybridEnabled ?? true
  let topK = options?.topK ?? 5
  const rrfConstant = options?.rrfConstant ?? 60

  if (options.projectId) {
    const projectRes = await db.query<any>(
      'SELECT retrieval_top_k, hybrid_retrieval_enabled FROM projects WHERE id = $1',
      [options.projectId]
    )
    if (projectRes.rows.length > 0) {
      const p = projectRes.rows[0]
      topK = p.retrieval_top_k !== null ? p.retrieval_top_k : topK
      hybridEnabled = p.hybrid_retrieval_enabled !== null ? p.hybrid_retrieval_enabled : hybridEnabled
    }
  }

  const modelConfig = getEmbeddingModelConfig(options.embeddingModelId)
  if (!modelConfig) {
    throw new Error(`Embedding model config not found for: ${options.embeddingModelId}`)
  }

  const provider = getEmbeddingProvider('local')

  // 1. Generate query embedding
  const embedStart = performance.now()
  await provider.load(modelConfig.modelId)
  const queryPrefix = modelConfig.requiresPrefix && modelConfig.queryPrefix
    ? modelConfig.queryPrefix
    : ''
  const queryEmbeddingResult = await provider.embedQuery(queryPrefix + query)
  const vectorString = `[${queryEmbeddingResult.embedding.join(',')}]`
  const embedMs = performance.now() - embedStart

  // 2. Query vector similarity
  const vectorLimit = options?.vectorLimit || 20
  const vectorValues: any[] = [vectorString, modelConfig.id]
  const vectorQueryParts = [
    `SELECT
      c.id,
      c.document_id,
      c.chunk_index,
      c.text,
      c.token_count,
      c.metadata_json,
      d.name as document_name,
      (1 - (c.embedding <=> $1)) as score
     FROM chunks c
     JOIN documents d ON c.document_id = d.id
     WHERE c.embedding_model_id = $2`,
  ]

  const effectiveDocumentIds = options?.documentIds && options.documentIds.length > 0
    ? options.documentIds
    : options?.documentId
      ? [options.documentId]
      : null

  if (effectiveDocumentIds) {
    vectorValues.push(effectiveDocumentIds)
    vectorQueryParts.push(`AND c.document_id = ANY($${vectorValues.length})`)
  }
  if (options?.projectId) {
    vectorValues.push(options.projectId)
    vectorQueryParts.push(`AND d.project_id = $${vectorValues.length}`)
  }

  vectorQueryParts.push(`ORDER BY c.embedding <=> $1 LIMIT $${vectorValues.length + 1}`)
  vectorValues.push(vectorLimit)

  const vectorStart = performance.now()
  const vectorRes = await db.query<any>(vectorQueryParts.join('\n'), vectorValues)
  const vectorRows = vectorRes.rows
  const vectorMs = performance.now() - vectorStart

  const semanticHits = vectorRows.map((row, i) => rowToDebugHit(row, i + 1))

  const baseDebug = {
    query,
    hybridEnabled,
    topK,
    rrfConstant,
    vectorLimit,
    keywordLimit: options?.keywordLimit || 20,
    embeddingModelId: modelConfig.id,
    documentFilterCount: effectiveDocumentIds?.length ?? null,
  }

  // If hybrid search is disabled, return vector results directly
  if (!hybridEnabled) {
    const results: RetrievalResult[] = vectorRows.map((row) => {
      const meta = parseMeta(row.metadata_json)
      return {
        chunkId: row.id,
        documentId: row.document_id,
        documentName: row.document_name,
        chunkIndex: row.chunk_index,
        text: row.text,
        score: row.score,
        source: 'vector' as const,
        metadata: {
          ...meta,
          vectorScore: row.score,
        },
      }
    }).slice(0, topK)

    const fusedHits = results.map((r, i) => ({
      rank: i + 1,
      chunkId: r.chunkId,
      documentName: r.documentName,
      chunkIndex: r.chunkIndex,
      score: r.score,
      text: r.text,
      pageNumber: r.metadata.pageNumber ?? null,
      vectorScore: r.metadata.vectorScore ?? null,
      source: 'vector' as const,
    }))

    const totalMs = performance.now() - totalStart
    return {
      results,
      debug: {
        ...baseDebug,
        timingMs: {
          embed: Math.round(embedMs),
          vector: Math.round(vectorMs),
          keyword: 0,
          fusion: 0,
          total: Math.round(totalMs),
        },
        semanticHits,
        keywordHits: [],
        fusedHits,
      },
    }
  }

  // 3. Query keyword matches using plainto_tsquery
  const keywordLimit = options?.keywordLimit || 20
  const keywordValues: any[] = [query]
  const keywordQueryParts = [
    `SELECT
      c.id,
      c.document_id,
      c.chunk_index,
      c.text,
      c.token_count,
      c.metadata_json,
      d.name as document_name,
      ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', $1)) as score
     FROM chunks c
     JOIN documents d ON c.document_id = d.id
     WHERE to_tsvector('english', c.text) @@ plainto_tsquery('english', $1)`,
  ]

  if (effectiveDocumentIds) {
    keywordValues.push(effectiveDocumentIds)
    keywordQueryParts.push(`AND c.document_id = ANY($${keywordValues.length})`)
  }
  if (options?.projectId) {
    keywordValues.push(options.projectId)
    keywordQueryParts.push(`AND d.project_id = $${keywordValues.length}`)
  }

  keywordQueryParts.push(`ORDER BY score DESC LIMIT $${keywordValues.length + 1}`)
  keywordValues.push(keywordLimit)

  const keywordStart = performance.now()
  const keywordRes = await db.query<any>(keywordQueryParts.join('\n'), keywordValues)
  const keywordRows = keywordRes.rows
  const keywordMs = performance.now() - keywordStart

  const keywordHits = keywordRows.map((row, i) => rowToDebugHit(row, i + 1))

  // 4. Perform Reciprocal Rank Fusion (RRF)
  const fusionStart = performance.now()
  const { results, fusedHits } = reciprocalRankFusion(vectorRows, keywordRows, rrfConstant, topK)
  const fusionMs = performance.now() - fusionStart
  const totalMs = performance.now() - totalStart

  return {
    results,
    debug: {
      ...baseDebug,
      keywordLimit,
      timingMs: {
        embed: Math.round(embedMs),
        vector: Math.round(vectorMs),
        keyword: Math.round(keywordMs),
        fusion: Math.round(fusionMs),
        total: Math.round(totalMs),
      },
      semanticHits,
      keywordHits,
      fusedHits,
    },
  }
}

export function reciprocalRankFusion(
  vectorResults: any[],
  keywordResults: any[],
  rrfConstant = 60,
  topK = 5
): { results: RetrievalResult[]; fusedHits: RetrievalDebugHit[] } {
  const scoreMap = new Map<
    string,
    {
      chunk: any
      vectorRank: number | null
      keywordRank: number | null
      vectorScore: number | null
      keywordScore: number | null
    }
  >()

  vectorResults.forEach((row, index) => {
    scoreMap.set(row.id, {
      chunk: row,
      vectorRank: index + 1,
      keywordRank: null,
      vectorScore: row.score,
      keywordScore: null,
    })
  })

  keywordResults.forEach((row, index) => {
    const existing = scoreMap.get(row.id)
    if (existing) {
      existing.keywordRank = index + 1
      existing.keywordScore = row.score
    } else {
      scoreMap.set(row.id, {
        chunk: row,
        vectorRank: null,
        keywordRank: index + 1,
        vectorScore: null,
        keywordScore: row.score,
      })
    }
  })

  const fused: RetrievalResult[] = []

  scoreMap.forEach((entry, chunkId) => {
    const { chunk, vectorRank, keywordRank, vectorScore, keywordScore } = entry

    const rrfScore =
      (vectorRank !== null ? 1 / (rrfConstant + vectorRank) : 0) +
      (keywordRank !== null ? 1 / (rrfConstant + keywordRank) : 0)

    let source: 'vector' | 'keyword' | 'hybrid' = 'hybrid'
    if (vectorRank === null) source = 'keyword'
    else if (keywordRank === null) source = 'vector'

    const meta = parseMeta(chunk.metadata_json)

    fused.push({
      chunkId,
      documentId: chunk.document_id,
      documentName: chunk.document_name,
      chunkIndex: chunk.chunk_index,
      text: chunk.text,
      score: rrfScore,
      source,
      metadata: {
        ...meta,
        vectorScore: vectorScore !== null ? vectorScore : undefined,
        keywordScore: keywordScore !== null ? keywordScore : undefined,
        vectorRank: vectorRank ?? undefined,
        keywordRank: keywordRank ?? undefined,
      },
    })
  })

  fused.sort((a, b) => b.score - a.score)
  const results = fused.slice(0, topK)

  const fusedHits: RetrievalDebugHit[] = results.map((r, i) => ({
    rank: i + 1,
    chunkId: r.chunkId,
    documentName: r.documentName,
    chunkIndex: r.chunkIndex,
    score: r.score,
    text: r.text,
    pageNumber: r.metadata.pageNumber ?? null,
    vectorRank: r.metadata.vectorRank ?? null,
    keywordRank: r.metadata.keywordRank ?? null,
    vectorScore: r.metadata.vectorScore ?? null,
    keywordScore: r.metadata.keywordScore ?? null,
    source: r.source,
  }))

  return { results, fusedHits }
}
