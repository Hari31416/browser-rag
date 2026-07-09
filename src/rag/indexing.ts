import { getDb } from '@/db/client'
import { getEmbeddingProvider } from '@/rag/embedding-runtime'
import { getEmbeddingModelConfig } from '@/rag/embedding-models'

export interface IndexDocumentParams {
  docId: string
  fileBytes: Uint8Array
  fileName: string
  mimeType: string
  projectId: string
  embeddingModelId: string
  chunkSize: number
  chunkOverlap: number
  onStatus?: (message: string) => void
}

export async function indexDocument(params: IndexDocumentParams): Promise<void> {
  const {
    docId,
    fileBytes,
    fileName,
    mimeType,
    embeddingModelId,
    chunkSize,
    chunkOverlap,
    onStatus,
  } = params

  const db = getDb()
  const modelConfig = getEmbeddingModelConfig(embeddingModelId)
  if (!modelConfig) {
    throw new Error(`Embedding model configuration not found for: ${embeddingModelId}`)
  }
  const provider = getEmbeddingProvider('local')

  await db.query(
    `UPDATE documents
     SET status = $1, error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    ['processing', docId]
  )

  const { extraction, chunks } = await new Promise<{
    extraction: any
    chunks: any[]
  }>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/indexing.worker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.postMessage({
      docId,
      fileBytes,
      fileName,
      mimeType,
      options: { chunkSize, chunkOverlap },
    })

    worker.onmessage = (event) => {
      const { status, extraction: ext, chunks: ch, error } = event.data
      if (status === 'success') {
        worker.terminate()
        resolve({ extraction: ext, chunks: ch })
      } else {
        worker.terminate()
        reject(new Error(error || 'Worker parsing/chunking failed'))
      }
    }

    worker.onerror = (err) => {
      worker.terminate()
      reject(new Error(err.message || 'Worker runtime error'))
    }
  })

  try {
    onStatus?.(`Loading embedding model ${modelConfig.displayName}...`)
    await provider.load(modelConfig.modelId, (prog: any) => {
      if (prog.type === 'load') {
        onStatus?.(`Downloading ${modelConfig.displayName}: ${Math.round(prog.progress)}%`)
      }
    })

    onStatus?.(`Generating embeddings for ${chunks.length} chunks...`)
    const passagePrefix =
      modelConfig.requiresPrefix && modelConfig.passagePrefix ? modelConfig.passagePrefix : ''
    const chunkTexts = chunks.map((c: any) => passagePrefix + c.text)
    const embeddingResults = await provider.embedTexts(chunkTexts, {
      onProgress: (prog: any) => {
        if (prog.type === 'embed') {
          onStatus?.(`Embedding chunks: ${prog.current} of ${prog.total}`)
        }
      },
    })

    const ocrRequired = extraction.metadata?.ocrRequired ? 1 : 0
    const metadataJson = JSON.stringify({
      ocrRequired,
      pageCount: extraction.metadata?.pageCount || 1,
      extension: extraction.metadata?.extension || fileName.split('.').pop(),
    })

    // Clear any previous chunks before writing (needed for retry)
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM chunks WHERE document_id = $1', [docId])
      await tx.query(
        `UPDATE documents
         SET status = $1, metadata_json = $2, error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        ['completed', metadataJson, docId]
      )

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const embeddingVector = embeddingResults[i].embedding
        const vectorString = `[${embeddingVector.join(',')}]`
        const chunkId = crypto.randomUUID()

        await tx.query(
          `INSERT INTO chunks (
            id, document_id, chunk_index, text, token_count,
            embedding_model_id, embedding_provider_id, embedding_dimensions, embedding, metadata_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            chunkId,
            docId,
            chunk.chunkIndex,
            chunk.text,
            chunk.tokenCount,
            modelConfig.id,
            provider.id,
            modelConfig.dimensions,
            vectorString,
            JSON.stringify({
              startOffset: chunk.startOffset,
              endOffset: chunk.endOffset,
              pageNumber: chunk.pageNumber,
              headingPath: chunk.headingPath,
            }),
          ]
        )
      }
    })
  } catch (err: any) {
    const message = err?.message || String(err)
    await db.query(
      `UPDATE documents
       SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      ['failed', message, docId]
    )
    throw err
  }
}

export async function markDocumentFailed(docId: string, errorMessage: string): Promise<void> {
  const db = getDb()
  await db.query(
    `UPDATE documents
     SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    ['failed', errorMessage, docId]
  )
}
