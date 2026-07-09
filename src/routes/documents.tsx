import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UploadPanel } from '@/components/documents/upload-panel'
import { ChunkExplorer } from '@/components/documents/chunk-explorer'
import { isDbInitialized, getDb } from '@/db/client'
import { getEmbeddingModelConfig } from '@/rag/embedding-models'
import { indexDocument, markDocumentFailed } from '@/rag/indexing'
import {
  saveDocumentFile,
  getDocumentFile,
  deleteDocumentFile,
} from '@/lib/document-files'
import {
  FileText,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  FolderOpen,
  RotateCcw,
  Eye,
} from 'lucide-react'
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
  const [explorerDoc, setExplorerDoc] = useState<{ id: string; name: string } | null>(null)

  const {
    activeProject,
    embeddingReady,
    embeddingLoading,
    embeddingProgress,
    loadEmbeddingModel,
  } = useSystemInit()

  const modelConfig = activeProject
    ? getEmbeddingModelConfig(activeProject.embeddingModelId)
    : null

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

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', dbReady, activeProject?.id],
    queryFn: async () => {
      if (!dbReady || !activeProject) return []
      const db = getDb()
      const res = await db.query<any>(
        'SELECT * FROM documents WHERE project_id = $1 ORDER BY created_at DESC',
        [activeProject.id]
      )
      return res.rows
    },
    enabled: dbReady && !!activeProject,
  })

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!dbReady) throw new Error('Database not ready')
      if (!activeProject) throw new Error('No active project selected')
      const db = getDb()

      for (const file of files) {
        setUploadingStatus(`Processing ${file.name}...`)
        const docId = crypto.randomUUID()
        const arrayBuffer = await file.arrayBuffer()
        const fileBytes = new Uint8Array(arrayBuffer)

        await db.query(
          `INSERT INTO documents (id, project_id, source_type, name, mime_type, size_bytes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [docId, activeProject.id, file.name.split('.').pop() || 'txt', file.name, file.type, file.size, 'pending']
        )

        try {
          await saveDocumentFile(docId, file.name, file.type, fileBytes)
        } catch (storeErr) {
          console.warn('Failed to persist file bytes for retry:', storeErr)
        }

        queryClient.invalidateQueries({ queryKey: ['documents'] })

        try {
          await indexDocument({
            docId,
            fileBytes,
            fileName: file.name,
            mimeType: file.type,
            projectId: activeProject.id,
            embeddingModelId: activeProject.embeddingModelId,
            chunkSize: activeProject.chunkSize ?? 500,
            chunkOverlap: activeProject.chunkOverlap ?? 100,
            onStatus: setUploadingStatus,
          })
        } catch (err: any) {
          const message = err?.message || String(err)
          await markDocumentFailed(docId, message)
          throw err
        }
      }
    },
    onSuccess: () => {
      setUploadingStatus(null)
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['project-doc-counts'] })
      queryClient.invalidateQueries({ queryKey: ['project-docs'] })
    },
    onError: (error) => {
      setUploadingStatus(`Indexing failed: ${error.message}`)
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      setTimeout(() => setUploadingStatus(null), 5000)
    },
  })

  const retryMutation = useMutation({
    mutationFn: async (docId: string) => {
      if (!dbReady) throw new Error('Database not ready')
      if (!activeProject) throw new Error('No active project selected')

      const stored = await getDocumentFile(docId)
      if (!stored) {
        throw new Error('Original file is not available for retry. Please re-upload the document.')
      }

      setUploadingStatus(`Retrying ${stored.fileName}...`)
      const fileBytes = new Uint8Array(stored.bytes)

      try {
        await indexDocument({
          docId,
          fileBytes,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          projectId: activeProject.id,
          embeddingModelId: activeProject.embeddingModelId,
          chunkSize: activeProject.chunkSize ?? 500,
          chunkOverlap: activeProject.chunkOverlap ?? 100,
          onStatus: setUploadingStatus,
        })
      } catch (err: any) {
        await markDocumentFailed(docId, err?.message || String(err))
        throw err
      }
    },
    onSuccess: () => {
      setUploadingStatus(null)
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['project-doc-counts'] })
      queryClient.invalidateQueries({ queryKey: ['project-docs'] })
      queryClient.invalidateQueries({ queryKey: ['document-chunks'] })
    },
    onError: (error) => {
      setUploadingStatus(`Retry failed: ${error.message}`)
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      setTimeout(() => setUploadingStatus(null), 5000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      if (!dbReady) throw new Error('Database not ready')
      const db = getDb()
      await db.query('DELETE FROM documents WHERE id = $1', [docId])
      try {
        await deleteDocumentFile(docId)
      } catch (_) {
        /* best-effort cleanup */
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['project-doc-counts'] })
      queryClient.invalidateQueries({ queryKey: ['project-docs'] })
      if (explorerDoc) setExplorerDoc(null)
    },
  })

  const handleFilesSelected = (files: File[]) => {
    uploadMutation.mutate(files)
  }

  const isBusy = uploadMutation.isPending || retryMutation.isPending

  if (!activeProject) {
    return (
      <div className='flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center page-enter'>
        <div className='p-4 bg-secondary rounded-md text-muted-foreground border border-border/60'>
          <FolderOpen className='h-8 w-8' />
        </div>
        <div className='space-y-1'>
          <p className='font-heading font-semibold text-lg text-foreground'>No active project</p>
          <p className='text-xs text-muted-foreground max-w-xs'>
            Select or create a project first to manage documents.
          </p>
        </div>
        <Link to='/projects'>
          <Button variant='outline' className='flex items-center gap-2 text-xs'>
            <FolderOpen className='h-3.5 w-3.5' />
            Go to Projects
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className='space-y-6 flex-1 flex flex-col min-h-0'>
      {explorerDoc && (
        <ChunkExplorer
          documentId={explorerDoc.id}
          documentName={explorerDoc.name}
          onClose={() => setExplorerDoc(null)}
        />
      )}

      <div className='shrink-0 flex items-center justify-between gap-4'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>Documents</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            Upload and index documents into your local PGlite vector database.
          </p>
        </div>
        <div className='flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border/70 text-xs text-muted-foreground shrink-0'>
          <FolderOpen className='h-3.5 w-3.5 text-primary/70' />
          <span className='font-semibold text-foreground'>{activeProject.name}</span>
          <span className='text-border'>·</span>
          <Layers className='h-3 w-3' />
          <span>{modelConfig?.displayName ?? activeProject.embeddingModelId}</span>
        </div>
      </div>

      <div className='grid gap-6 md:grid-cols-3 flex-1 min-h-0'>
        <div className='md:col-span-1 space-y-4 shrink-0'>
          <Card className='bg-card border-border/70'>
            <CardHeader>
              <CardTitle>File Upload</CardTitle>
              <CardDescription>Select documents to parse and add to the index.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {!embeddingReady ? (
                <div className='space-y-4 p-4 border border-border/70 rounded-md bg-accent/20 flex flex-col items-center text-center gap-3'>
                  <div className='p-3 bg-primary/10 rounded-md text-primary border border-primary/20'>
                    <Layers className='h-6 w-6' />
                  </div>
                  <div className='space-y-1'>
                    <h4 className='font-heading font-semibold text-sm'>Embedding Model Required</h4>
                    <p className='text-[11px] text-muted-foreground max-w-[200px] mx-auto'>
                      Load the embedding model to extract document features and index them.
                    </p>
                    <p className='text-[10px] text-primary font-semibold mt-1'>
                      Model: {modelConfig?.displayName || 'None'}
                    </p>
                  </div>

                  {embeddingLoading ? (
                    <div className='w-full space-y-1.5 pt-2'>
                      <div className='flex justify-between text-[10px] font-semibold text-muted-foreground font-mono'>
                        <span className='flex items-center gap-1'>
                          <Loader2 className='h-3 w-3 animate-spin text-primary' />
                          Downloading...
                        </span>
                        <span>{embeddingProgress}%</span>
                      </div>
                      <div className='w-full bg-secondary h-1 rounded-full overflow-hidden'>
                        <div
                          className='bg-primary h-full transition-all duration-300'
                          style={{ width: `${embeddingProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={loadEmbeddingModel}
                      className='w-full mt-2 font-semibold'
                    >
                      Load Embedding Model
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <UploadPanel
                    onFilesSelected={handleFilesSelected}
                    disabled={isBusy || !dbReady}
                  />
                  {uploadingStatus && (
                    <div className='flex items-center gap-2 p-3 bg-accent/40 rounded-md text-xs text-foreground font-medium border border-border/60'>
                      <Loader2 className='h-4 w-4 animate-spin text-primary shrink-0' />
                      <span>{uploadingStatus}</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className='md:col-span-2 flex flex-col min-h-0'>
          <Card className='flex-1 bg-card border-border/70 flex flex-col overflow-hidden'>
            <CardHeader className='shrink-0'>
              <CardTitle>Indexed Documents</CardTitle>
              <CardDescription>View and manage your locally stored files.</CardDescription>
            </CardHeader>
            <CardContent className='flex-1 overflow-y-auto min-h-0 pt-0'>
              {!dbReady || isLoading ? (
                <div className='h-48 flex items-center justify-center text-muted-foreground gap-2'>
                  <Loader2 className='h-5 w-5 animate-spin text-primary' />
                  <span>Loading local documents...</span>
                </div>
              ) : documents.length === 0 ? (
                <div className='h-48 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2'>
                  <FileText className='h-10 w-10 text-muted-foreground/40' />
                  <span>No documents indexed yet. Use the upload panel to add some.</span>
                </div>
              ) : (
                <div className='space-y-4'>
                  <div className='hidden sm:block border border-border/50 rounded-lg overflow-hidden'>
                    <table className='w-full text-left text-sm border-collapse'>
                      <thead>
                        <tr className='bg-accent/40 border-b border-border/50'>
                          <th className='p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground'>Name</th>
                          <th className='p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground'>Size</th>
                          <th className='p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground'>Status</th>
                          <th className='p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right'>Action</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-border/40'>
                        {documents.map((doc: any) => (
                          <tr key={doc.id} className='hover:bg-accent/10 transition-colors align-top'>
                            <td className='p-3 font-medium max-w-[220px]'>
                              <div className='truncate'>{doc.name}</div>
                              {doc.status === 'failed' && doc.error_message && (
                                <p className='text-[11px] text-destructive/90 mt-1 leading-snug line-clamp-3 font-normal'>
                                  {doc.error_message}
                                </p>
                              )}
                            </td>
                            <td className='p-3 text-muted-foreground font-mono text-xs whitespace-nowrap'>
                              {formatBytes(doc.size_bytes)}
                            </td>
                            <td className='p-3'>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium ${
                                  doc.status === 'completed'
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                    : doc.status === 'failed'
                                      ? 'bg-destructive/10 text-destructive'
                                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 animate-pulse'
                                }`}
                              >
                                {doc.status === 'completed' && <CheckCircle2 className='h-3 w-3' />}
                                {doc.status === 'failed' && <AlertCircle className='h-3 w-3' />}
                                {(doc.status === 'processing' || doc.status === 'pending') && (
                                  <Loader2 className='h-3 w-3 animate-spin' />
                                )}
                                <span className='capitalize'>{doc.status}</span>
                              </span>
                            </td>
                            <td className='p-3 text-right'>
                              <div className='inline-flex items-center gap-0.5'>
                                {doc.status === 'completed' && (
                                  <Button
                                    variant='ghost'
                                    size='icon'
                                    title='Explore chunks'
                                    onClick={() => setExplorerDoc({ id: doc.id, name: doc.name })}
                                    className='h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg'
                                  >
                                    <Eye className='h-4 w-4' />
                                  </Button>
                                )}
                                {doc.status === 'failed' && (
                                  <Button
                                    variant='ghost'
                                    size='icon'
                                    title='Retry indexing'
                                    disabled={isBusy}
                                    onClick={() => retryMutation.mutate(doc.id)}
                                    className='h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg'
                                  >
                                    {retryMutation.isPending && retryMutation.variables === doc.id ? (
                                      <Loader2 className='h-4 w-4 animate-spin' />
                                    ) : (
                                      <RotateCcw className='h-4 w-4' />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant='ghost'
                                  size='icon'
                                  disabled={deleteMutation.isPending || isBusy}
                                  onClick={() => deleteMutation.mutate(doc.id)}
                                  className='h-8 w-8 hover:text-destructive text-muted-foreground hover:bg-destructive/10 rounded-lg'
                                >
                                  <Trash2 className='h-4 w-4' />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className='sm:hidden space-y-3'>
                    {documents.map((doc: any) => (
                      <div key={doc.id} className='p-3 rounded-lg border border-border/45 bg-accent/5 flex flex-col gap-2'>
                        <div className='flex items-start justify-between gap-2'>
                          <p className='font-medium text-xs text-foreground break-all line-clamp-2 flex-1'>{doc.name}</p>
                          <div className='flex items-center gap-0.5 shrink-0'>
                            {doc.status === 'completed' && (
                              <Button
                                variant='ghost'
                                size='icon'
                                title='Explore chunks'
                                onClick={() => setExplorerDoc({ id: doc.id, name: doc.name })}
                                className='h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg'
                              >
                                <Eye className='h-3.5 w-3.5' />
                              </Button>
                            )}
                            {doc.status === 'failed' && (
                              <Button
                                variant='ghost'
                                size='icon'
                                title='Retry indexing'
                                disabled={isBusy}
                                onClick={() => retryMutation.mutate(doc.id)}
                                className='h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg'
                              >
                                <RotateCcw className='h-3.5 w-3.5' />
                              </Button>
                            )}
                            <Button
                              variant='ghost'
                              size='icon'
                              disabled={deleteMutation.isPending || isBusy}
                              onClick={() => deleteMutation.mutate(doc.id)}
                              className='h-7 w-7 hover:text-destructive text-muted-foreground hover:bg-destructive/10 rounded-lg'
                            >
                              <Trash2 className='h-3.5 w-3.5' />
                            </Button>
                          </div>
                        </div>
                        {doc.status === 'failed' && doc.error_message && (
                          <p className='text-[10px] text-destructive/90 leading-snug'>{doc.error_message}</p>
                        )}
                        <div className='flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap'>
                          <span className='font-mono'>{formatBytes(doc.size_bytes)}</span>
                          <span>·</span>
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm font-medium ${
                              doc.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : doc.status === 'failed'
                                  ? 'bg-destructive/10 text-destructive'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 animate-pulse'
                            }`}
                          >
                            {doc.status === 'completed' && <CheckCircle2 className='h-2.5 w-2.5 font-semibold' />}
                            {doc.status === 'failed' && <AlertCircle className='h-2.5 w-2.5' />}
                            {(doc.status === 'processing' || doc.status === 'pending') && (
                              <Loader2 className='h-2.5 w-2.5 animate-spin' />
                            )}
                            <span className='capitalize'>{doc.status}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
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
