import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UploadPanel } from '@/components/documents/upload-panel'
import { isDbInitialized, getDb } from '@/db/client'
import { getEmbeddingProvider } from '@/rag/embedding-runtime'
import { getEmbeddingModelConfig } from '@/rag/embedding-models'
import { FileText, Trash2, CheckCircle2, AlertCircle, Loader2, Layers } from 'lucide-react'
import { useSystemInit } from '@/context/system-init-context'

export const Route = createFileRoute('/documents')({
  component: DocumentsComponent,
})

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function DocumentsComponent() {
  const queryClient = useQueryClient()
  const [dbReady, setDbReady] = useState(isDbInitialized())
  const [uploadingStatus, setUploadingStatus] = useState<string | null>(null)

  // Consume from system context
  const {
    preferences: prefs,
    embeddingReady,
    embeddingLoading,
    embeddingProgress,
    loadEmbeddingModel
  } = useSystemInit()

  const modelConfig = getEmbeddingModelConfig(prefs.embeddingModelId)

  useEffect(() => {
    if (dbReady) return

    const interval = setInterval(() => {
      if (isDbInitialized()) {
        setDbReady(true)
        clearInterval(interval)
      }
    }, 200)

    return () => clearInterval(interval)
  }, [dbReady])

  // Query documents list
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', dbReady],
    queryFn: async () => {
      if (!dbReady) return []
      const db = getDb()
      const res = await db.query<any>('SELECT * FROM documents ORDER BY created_at DESC')
      return res.rows
    },
    enabled: dbReady,
  })

  // Mutation for file upload and text extraction
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!dbReady) throw new Error('Database not ready')
      const db = getDb()
      const modelConfig = getEmbeddingModelConfig(prefs.embeddingModelId)
      if (!modelConfig) {
        throw new Error(`Embedding model configuration not found for: ${prefs.embeddingModelId}`)
      }
      const provider = getEmbeddingProvider(prefs.embeddingProviderId)

      console.log('[INDEXING START] Processing files:', files.map(f => f.name))

      for (const file of files) {
        setUploadingStatus(`Processing ${file.name}...`)
        const docId = crypto.randomUUID()
        const arrayBuffer = await file.arrayBuffer()
        const fileBytes = new Uint8Array(arrayBuffer)

        console.log(`[INDEXING STEP] Inserting pending record for document: ${file.name} (ID: ${docId})`)
        // Insert initial document row with 'pending' status
        await db.query(
          `INSERT INTO documents (id, collection_id, source_type, name, mime_type, size_bytes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [docId, 'default', file.name.split('.').pop() || 'txt', file.name, file.type, file.size, 'pending']
        )

        // Force react-query to refresh listing so the UI immediately shows 'pending'
        queryClient.invalidateQueries({ queryKey: ['documents'] })

        console.log(`[INDEXING STEP] Spawning indexing.worker for: ${file.name}`)
        // Run Web Worker for off-thread parsing and chunking
        await new Promise<void>((resolve, reject) => {
          const worker = new Worker(
            new URL('../workers/indexing.worker.ts', import.meta.url),
            { type: 'module' }
          )

          worker.postMessage({
            docId,
            fileBytes,
            fileName: file.name,
            mimeType: file.type,
            options: {
              chunkSize: prefs.chunkSize,
              chunkOverlap: prefs.chunkOverlap,
            },
          })

          worker.onmessage = async (event) => {
            const { status, extraction, chunks, error } = event.data
            console.log(`[INDEXING WORKER ONMESSAGE] Status: ${status} for file: ${file.name}`)

            if (status === 'success') {
              try {
                console.log(`[INDEXING STEP] Text extraction successful. Chunks count: ${chunks.length}. Loading embedding provider: ${provider.id}`)
                setUploadingStatus(`Loading embedding model ${modelConfig.displayName}...`)
                await provider.load(modelConfig.modelId, (prog: any) => {
                  if (prog.type === 'load') {
                    setUploadingStatus(
                      `Downloading ${modelConfig.displayName}: ${Math.round(prog.progress)}%`
                    )
                  }
                })

                console.log(`[INDEXING STEP] Embedding model ready. Generating embeddings for ${chunks.length} chunks...`)
                setUploadingStatus(`Generating embeddings for ${chunks.length} chunks...`)
                const chunkTexts = chunks.map((c: any) => c.text)
                const embeddingResults = await provider.embedTexts(chunkTexts, {
                  onProgress: (prog: any) => {
                    if (prog.type === 'embed') {
                      setUploadingStatus(
                        `Embedding chunks: ${prog.current} of ${prog.total}`
                      )
                    }
                  },
                })

                console.log(`[INDEXING STEP] Embedding generation completed. Starting database write transaction...`)
                const ocrRequired = extraction.metadata?.ocrRequired ? 1 : 0
                const metadataJson = JSON.stringify({
                  ocrRequired,
                  pageCount: extraction.metadata?.pageCount || 1,
                  extension: extraction.metadata?.extension || file.name.split('.').pop(),
                })

                // Use transaction to update document and insert chunks atomically
                await db.transaction(async (tx) => {
                  await tx.query(
                    `UPDATE documents
                     SET status = $1, metadata_json = $2, updated_at = CURRENT_TIMESTAMP
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

                console.log(`[INDEXING SUCCESS] Indexing fully completed and written to PGlite database for: ${file.name}`)
                worker.terminate()
                resolve()
              } catch (writeErr: any) {
                console.error(`[INDEXING WRITE ERROR] Failed during embedding load, inference, or DB write:`, writeErr)
                try {
                  await db.query(
                    `UPDATE documents
                     SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $3`,
                    ['failed', writeErr?.message || String(writeErr), docId]
                  )
                } catch (dbErr) {
                  console.error(`[INDEXING FATAL] Failed to update document status to failed:`, dbErr)
                }
                worker.terminate()
                reject(writeErr)
              }
            } else {
              console.error(`[INDEXING WORKER ERROR] Worker returned failure status for ${file.name}:`, error)
              // Update status to failed
              await db.query(
                `UPDATE documents
                 SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                ['failed', error || 'Worker parsing/chunking failed', docId]
              )
              worker.terminate()
              reject(new Error(error))
            }
          }

          worker.onerror = async (err) => {
            console.error(`[INDEXING WORKER CRASH] Worker crashed for ${file.name}:`, err)
            await db.query(
              `UPDATE documents
               SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
               WHERE id = $3`,
              ['failed', err.message || 'Worker runtime error', docId]
            )
            worker.terminate()
            reject(err)
          }
        })
      }
    },
    onSuccess: () => {
      setUploadingStatus(null)
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (error) => {
      setUploadingStatus(`Indexing failed: ${error.message}`)
      setTimeout(() => setUploadingStatus(null), 5000)
    },
  })

  // Mutation for deleting a document
  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      if (!dbReady) throw new Error('Database not ready')
      const db = getDb()
      await db.query('DELETE FROM documents WHERE id = $1', [docId])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  const handleFilesSelected = (files: File[]) => {
    uploadMutation.mutate(files)
  }

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0 animate-fade-in">
      <div className="space-y-1 shrink-0">
        <h2 className="text-2xl font-bold tracking-tight">Document Management</h2>
        <p className="text-muted-foreground text-sm">
          Upload and index documents into your local PGlite vector database.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 flex-1 min-h-0">
        {/* Upload Container */}
        <div className="md:col-span-1 space-y-4 shrink-0">
          <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>File Upload</CardTitle>
              <CardDescription>Select documents to parse and add to the index.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!embeddingReady ? (
                <div className="space-y-4 p-4 border border-border/40 rounded-xl bg-accent/5 flex flex-col items-center text-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-full text-primary animate-pulse">
                    <Layers className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold text-sm">Embedding Model Required</h4>
                    <p className="text-[11px] text-muted-foreground max-w-[200px] mx-auto">
                      Load the embedding model to extract document features and index them.
                    </p>
                    <p className="text-[10px] text-primary/95 font-semibold mt-1">
                      Active: {modelConfig?.displayName || 'None'}
                    </p>
                  </div>
                  
                  {embeddingLoading ? (
                    <div className="w-full space-y-1.5 pt-2">
                      <div className="flex justify-between text-[10px] font-semibold text-muted-foreground font-mono">
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          Downloading...
                        </span>
                        <span>{embeddingProgress}%</span>
                      </div>
                      <div className="w-full bg-secondary/30 h-1 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${embeddingProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={loadEmbeddingModel}
                      className="w-full mt-2 font-semibold shadow-md"
                    >
                      Load Embedding Model
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <UploadPanel
                    onFilesSelected={handleFilesSelected}
                    disabled={uploadMutation.isPending || !dbReady}
                  />
                  {uploadingStatus && (
                    <div className="flex items-center gap-2 p-3 bg-accent/40 rounded-lg text-xs text-foreground font-medium animate-pulse border border-border/40">
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                      <span>{uploadingStatus}</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Documents List */}
        <div className="md:col-span-2 flex flex-col min-h-0">
          <Card className="flex-1 bg-card/50 border-border/50 backdrop-blur-sm flex flex-col overflow-hidden">
            <CardHeader className="shrink-0">
              <CardTitle>Indexed Documents</CardTitle>
              <CardDescription>View and manage your locally stored files.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0">
              {!dbReady || isLoading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span>Loading local documents...</span>
                </div>
              ) : documents.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                  <span>No documents indexed yet. Use the upload panel to add some.</span>
                </div>
              ) : (
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-accent/40 border-b border-border/50">
                        <th className="p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                        <th className="p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Size</th>
                        <th className="p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {documents.map((doc: any) => (
                        <tr key={doc.id} className="hover:bg-accent/10 transition-colors">
                          <td className="p-3 font-medium max-w-[200px] truncate">{doc.name}</td>
                          <td className="p-3 text-muted-foreground font-mono text-xs">
                            {formatBytes(doc.size_bytes)}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                doc.status === 'completed'
                                  ? 'bg-emerald-500/10 text-emerald-500'
                                  : doc.status === 'failed'
                                    ? 'bg-destructive/10 text-destructive'
                                    : 'bg-amber-500/10 text-amber-500 animate-pulse'
                              }`}
                            >
                              {doc.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                              {doc.status === 'failed' && <AlertCircle className="h-3 w-3" />}
                              {doc.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
                              {doc.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
                              <span className="capitalize">{doc.status}</span>
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate(doc.id)}
                              className="h-8 w-8 hover:text-destructive text-muted-foreground hover:bg-destructive/10 rounded-lg"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
export default DocumentsComponent
