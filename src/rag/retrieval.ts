import { getDb, isDbInitialized } from '@/db/client'
import { loadPreferences } from '@/lib/preferences'
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
  }
}

export interface RetrievalOptions {
  collectionId?: string
  documentId?: string
  topK?: number
  vectorLimit?: number
  keywordLimit?: number
  hybridEnabled?: boolean
  rrfConstant?: number
}

export async function retrieveChunks(
  query: string,
  options?: RetrievalOptions
): Promise<RetrievalResult[]> {
  if (!isDbInitialized()) {
    throw new Error('Database not initialized')
  }

  const db = getDb()
  const prefs = loadPreferences()
  
  const hybridEnabled = options?.hybridEnabled ?? prefs.hybridRetrievalEnabled
  const topK = options?.topK ?? prefs.retrievalTopK
  const rrfConstant = options?.rrfConstant ?? 60

  const modelConfig = getEmbeddingModelConfig(prefs.embeddingModelId)
  if (!modelConfig) {
    throw new Error(`Embedding model config not found for: ${prefs.embeddingModelId}`)
  }
  
  const provider = getEmbeddingProvider(prefs.embeddingProviderId)

  // 1. Generate query embedding
  await provider.load(modelConfig.modelId)
  const queryEmbeddingResult = await provider.embedQuery(query)
  const vectorString = `[${queryEmbeddingResult.embedding.join(',')}]`

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

  if (options?.documentId) {
    vectorValues.push(options.documentId)
    vectorQueryParts.push(`AND c.document_id = $${vectorValues.length}`)
  }
  if (options?.collectionId) {
    vectorValues.push(options.collectionId)
    vectorQueryParts.push(`AND d.collection_id = $${vectorValues.length}`)
  }

  vectorQueryParts.push(`ORDER BY c.embedding <=> $1 LIMIT $${vectorValues.length + 1}`)
  vectorValues.push(vectorLimit)

  const vectorRes = await db.query<any>(vectorQueryParts.join('\n'), vectorValues)
  const vectorRows = vectorRes.rows

  // If hybrid search is disabled, return vector results directly
  if (!hybridEnabled) {
    const results: RetrievalResult[] = vectorRows.map((row) => {
      let meta: Record<string, any> = {}
      try {
        meta = typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json || {}
      } catch {
        // Ignored
      }
      return {
        chunkId: row.id,
        documentId: row.document_id,
        documentName: row.document_name,
        chunkIndex: row.chunk_index,
        text: row.text,
        score: row.score,
        source: 'vector',
        metadata: {
          ...meta,
          vectorScore: row.score,
        },
      }
    })
    return results.slice(0, topK)
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

  if (options?.documentId) {
    keywordValues.push(options.documentId)
    keywordQueryParts.push(`AND c.document_id = $${keywordValues.length}`)
  }
  if (options?.collectionId) {
    keywordValues.push(options.collectionId)
    keywordQueryParts.push(`AND d.collection_id = $${keywordValues.length}`)
  }

  keywordQueryParts.push(`ORDER BY score DESC LIMIT $${keywordValues.length + 1}`)
  keywordValues.push(keywordLimit)

  const keywordRes = await db.query<any>(keywordQueryParts.join('\n'), keywordValues)
  const keywordRows = keywordRes.rows

  // 4. Perform Reciprocal Rank Fusion (RRF)
  return reciprocalRankFusion(vectorRows, keywordRows, rrfConstant, topK)
}

export function reciprocalRankFusion(
  vectorResults: any[],
  keywordResults: any[],
  rrfConstant = 60,
  topK = 5
): RetrievalResult[] {
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

    let meta: Record<string, any> = {}
    try {
      meta = typeof chunk.metadata_json === 'string' ? JSON.parse(chunk.metadata_json) : chunk.metadata_json || {}
    } catch {
      // Ignored
    }

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
      },
    })
  })

  fused.sort((a, b) => b.score - a.score)

  return fused.slice(0, topK)
}
