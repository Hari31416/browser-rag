import { useState, useRef, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Loader2, Sparkles, BookOpen, ChevronDown, ChevronUp, AlertCircle, FileText, CheckCircle2, Cpu, Layers, Filter, X, Check } from 'lucide-react'
import { getDb, isDbInitialized } from '@/db/client'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { getLLMVariant, getLLMOption, LLM_OPTIONS } from '@/llm/llm-models'
import { EMBEDDING_MODELS } from '@/rag/embedding-models'
import { generateRAGAnswer } from '@/rag/orchestrator'
import { useSystemInit } from '@/context/system-init-context'
import type { LLMRuntimeHandles } from '@/llm/llm-runtime'
import { marked } from 'marked'

export const Route = createFileRoute('/search')({
  component: SearchComponent,
})

function SearchComponent() {
  const [dbReady, setDbReady] = useState(isDbInitialized())
  const [queryText, setQueryText] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  
  // Streaming Generation State
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [thinkingContent, setThinkingContent] = useState('')
  const [answerContent, setAnswerContent] = useState('')
  const [citations, setCitations] = useState<any[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showThinking, setShowThinking] = useState(true)
  const [selectedCitationIndex, setSelectedCitationIndex] = useState<number | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Document filter state
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  // Fetch query history
  const { data: queryHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ['query-history', dbReady],
    queryFn: async () => {
      if (!dbReady) return []
      const db = getDb()
      const res = await db.query<any>(
        'SELECT * FROM query_history ORDER BY created_at DESC LIMIT 10'
      )
      return res.rows
    },
    enabled: dbReady,
  })


  const handleLoadHistoryItem = (item: any) => {
    setActiveQuery(item.query)
    setQueryText(item.query)
    setAnswerContent(item.answer || '')
    setThinkingContent('')
    setErrorMessage(null)
    setIsGenerating(false)
    setSelectedCitationIndex(null)
    try {
      setCitations(JSON.parse(item.retrieved_chunks_json || '[]'))
    } catch (e) {
      setCitations([])
    }
  }

  const handleClearHistory = async () => {
    if (!dbReady) return
    try {
      const db = getDb()
      await db.query('DELETE FROM query_history')
      refetchHistory()
    } catch (err) {
      console.error('Failed to clear query history:', err)
    }
  }

  // Consume from system context
  const {
    preferences: prefs,
    updatePreferences,
    activeProject,
    gemma4,
    webllm,
    lfm2,
    qwen35,
    isLlmReady,
    llmLoading,
    llmProgress,
    loadLlmModel,
    embeddingReady,
    embeddingLoading,
    embeddingProgress,
    loadEmbeddingModel,
    loadingError,
    setLoadingError,
  } = useSystemInit()

  // Fetch documents for the active project (for filter)
  const { data: projectDocs = [] } = useQuery({
    queryKey: ['project-docs', dbReady, activeProject?.id],
    queryFn: async () => {
      if (!dbReady || !activeProject) return []
      const db = getDb()
      const res = await db.query<any>(
        `SELECT id, name, status FROM documents WHERE project_id = $1 AND status = 'completed' ORDER BY name ASC`,
        [activeProject.id]
      )
      return res.rows
    },
    enabled: dbReady && !!activeProject,
  })

  const getLLMHandles = (): LLMRuntimeHandles => ({
    gemma4: gemma4 as unknown as LLMRuntimeHandles['gemma4'],
    webllm: webllm as unknown as LLMRuntimeHandles['webllm'],
    lfm2: lfm2 as unknown as LLMRuntimeHandles['lfm2'],
    qwen35: qwen35 as unknown as LLMRuntimeHandles['qwen35'],
  })

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

  // Close filter popover on outside click
  useEffect(() => {
    if (!filterOpen) return
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])

  const variant = getLLMVariant(prefs.llmVariantId)
  const option = getLLMOption(prefs.llmVariantId)

  const handleInitialize = async () => {
    setLoadingError(null)
    try {
      if (!embeddingReady) {
        await loadEmbeddingModel()
      }
      if (!isLlmReady) {
        await loadLlmModel()
      }
    } catch (err: any) {
      console.error('Failed to initialize models:', err)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!queryText.trim() || isGenerating) return

    // Clear previous states
    setActiveQuery(queryText)
    setIsGenerating(true)
    setErrorMessage(null)
    setThinkingContent('')
    setAnswerContent('')
    setCitations([])
    setStatusMessage('Connecting to local vector storage...')

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      // Models are already loaded at this point due to page-level block
      setStatusMessage('Searching and fusing documents...')

      // Run RAG Pipeline
      const stream = generateRAGAnswer(queryText, {
        projectId: activeProject?.id ?? '',
        embeddingModelId: activeProject?.embeddingModelId ?? '',
        documentIds: selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined,
        abortSignal: abortController.signal,
        llmHandles: getLLMHandles(),
      })

      setStatusMessage('Streaming answer...')
      let finalAnswer = ''
      let finalCitations: any[] = []

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break

        if (chunk.type === 'citations' && chunk.citations) {
          finalCitations = chunk.citations
          setCitations(chunk.citations)
        } else if (chunk.type === 'thinking_delta' && chunk.text) {
          setThinkingContent((prev) => prev + chunk.text)
        } else if (chunk.type === 'text_delta' && chunk.text) {
          finalAnswer += chunk.text
          setAnswerContent((prev) => prev + chunk.text)
        } else if (chunk.type === 'error' && chunk.error) {
          throw new Error(chunk.error)
        }
      }

      setStatusMessage(null)

      if (!abortController.signal.aborted && isDbInitialized()) {
        try {
          const db = getDb()
          await db.query(
            `INSERT INTO query_history (id, query, answer, retrieved_chunks_json, embedding_model_id, llm_model_id, project_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              crypto.randomUUID(),
              queryText,
              finalAnswer,
              JSON.stringify(finalCitations),
              activeProject?.embeddingModelId ?? '',
              prefs.llmVariantId,
              activeProject?.id ?? null,
            ]
          )
          refetchHistory()
        } catch (dbErr) {
          console.error('Failed to save to history:', dbErr)
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'An error occurred during query generation.')
      }
      setStatusMessage(null)
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    // Abort active LLM hook
    let activeHook: any
    if (variant.engine === 'transformers-js') activeHook = qwen35
    else if (variant.engine === 'webllm') activeHook = webllm
    else if (variant.engine === 'gemma4-kernel') activeHook = gemma4
    else if (variant.engine === 'lfm2-kernel') activeHook = lfm2
    activeHook?.abort()

    setIsGenerating(false)
    setStatusMessage('Generation cancelled')
    setTimeout(() => setStatusMessage(null), 2000)
  }

  const isLoaded = isLlmReady && embeddingReady
  const isInitializing = llmLoading || embeddingLoading

  return (
    <div className="space-y-6 flex flex-col flex-1 h-full min-h-0 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <p className="text-muted-foreground text-sm">
          Query your local documents with pgvector semantic search and keyword fusion.
        </p>
        {isLoaded && (
          <Card className="px-4 py-2 bg-secondary/35 border-border/40 text-xs flex items-center gap-2 select-none">
            <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
            <span>Active LLM: <strong className="font-semibold text-foreground">{option.name}</strong> ({variant.label})</span>
          </Card>
        )}
      </div>

      {!isLoaded ? (
        /* Setup / Initialization Card */
        <div className="flex-1 flex items-center justify-center p-6 min-h-[400px]">
          <Card className="w-full max-w-xl bg-card/20 border-border/40 backdrop-blur-md shadow-2xl relative overflow-hidden rounded-2xl">
            {/* Glowing top line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 via-primary to-primary/30" />

            <CardHeader className="text-center pb-4 pt-8">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 text-primary animate-pulse">
                <Cpu className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight">Initialize local AI engines to query</CardTitle>
              <CardDescription className="text-xs text-muted-foreground max-w-sm mx-auto">
                Before querying your documents, we need to load both the Embedding model and LLM weights into your browser memory.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6 px-8 pb-8">
              {loadingError && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3 text-xs leading-relaxed">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{loadingError}</span>
                </div>
              )}

              {/* Models selection configurations */}
              <div className='space-y-4'>
                <div className='space-y-1.5'>
                  <label className='text-xs font-semibold text-muted-foreground flex items-center gap-1.5'>
                    <Layers className='h-3.5 w-3.5 text-primary/70' />
                    Embedding Model (Project-locked)
                  </label>
                  <div className='w-full bg-background/30 border border-border/45 rounded-lg p-2.5 text-xs text-muted-foreground flex items-center gap-2'>
                    <span className='font-semibold text-foreground'>
                      {activeProject
                        ? (EMBEDDING_MODELS.find(m => m.id === activeProject.embeddingModelId)?.displayName ?? activeProject.embeddingModelId)
                        : 'No project selected'}
                    </span>
                    {activeProject && (
                      <span className='text-[10px] bg-secondary/60 border border-border/30 px-1.5 py-0.5 rounded text-muted-foreground'>
                        locked
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-primary/70" />
                    Local LLM Option
                  </label>
                  <select
                    disabled={isInitializing}
                    value={prefs.llmVariantId}
                    onChange={(e) => updatePreferences({ llmVariantId: e.target.value, llmModelId: getLLMOption(e.target.value).logicalModelId })}
                    className="w-full bg-background/50 border border-border/45 rounded-lg p-2.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none disabled:opacity-50"
                  >
                    {LLM_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} ({opt.variantLabel}) • {opt.sizeLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Loading progress bars */}
              {isInitializing && (
                <div className="space-y-4 border-t border-border/30 pt-4">
                  {/* Embedding progress */}
                  {!embeddingReady && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          Loading Embedding model...
                        </span>
                        <span className="font-mono text-primary">{embeddingProgress}%</span>
                      </div>
                      <div className="w-full bg-secondary/30 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${embeddingProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* LLM progress */}
                  {!isLlmReady && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          Downloading LLM weights ({option.name})...
                        </span>
                        <span className="font-mono text-primary">{llmProgress}%</span>
                      </div>
                      <div className="w-full bg-secondary/30 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${llmProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Button */}
              {!isInitializing && (
                <Button
                  onClick={handleInitialize}
                  className="w-full h-10 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 select-none transition-all active:scale-[0.99]"
                >
                  <Sparkles className="h-4 w-4" />
                  Initialize AI Engines
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Standard Workspace Interface (Loaded) */
        <>
            <form onSubmit={handleSearch} className="flex flex-col gap-2 shrink-0">
              {/* Search bar row */}
              <div className="flex gap-2">
                <Input
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Ask a question about your documents..."
                  className="flex-1 bg-background/50 border-border/40 focus:ring-primary focus:border-primary shadow-sm"
                  disabled={isGenerating || !dbReady}
                />

                {/* Document filter button */}
                <div className="relative" ref={filterRef}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFilterOpen((o) => !o)}
                    disabled={isGenerating || !dbReady || projectDocs.length === 0}
                    className={cn(
                      'flex items-center gap-1.5 border-border/40 shadow-sm transition-all',
                      selectedDocIds.size > 0 && 'border-primary/60 bg-primary/5 text-primary'
                    )}
                  >
                    <Filter className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">
                      {selectedDocIds.size > 0 ? `${selectedDocIds.size} doc${selectedDocIds.size > 1 ? 's' : ''}` : 'Filter'}
                    </span>
                    {selectedDocIds.size > 0 && (
                      <span
                        role="button"
                        aria-label="Clear filter"
                        onClick={(e) => { e.stopPropagation(); setSelectedDocIds(new Set()) }}
                        className="ml-0.5 hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </Button>

                  {/* Popover */}
                  {filterOpen && projectDocs.length > 0 && (
                    <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border/40 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden animate-fade-in">
                      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30 bg-card/10">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          Filter by Document
                        </span>
                        <div className="flex items-center gap-1">
                          {selectedDocIds.size > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedDocIds(new Set())}
                              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded"
                            >
                              Clear all
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedDocIds.size === projectDocs.length) {
                                setSelectedDocIds(new Set())
                              } else {
                                setSelectedDocIds(new Set(projectDocs.map((d: any) => d.id)))
                              }
                            }}
                            className="text-[10px] text-primary hover:underline px-1.5 py-0.5 rounded transition-colors"
                          >
                            {selectedDocIds.size === projectDocs.length ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1.5">
                        {projectDocs.map((doc: any) => {
                          const isChecked = selectedDocIds.has(doc.id)
                          return (
                            <button
                              type="button"
                              key={doc.id}
                              onClick={() => {
                                setSelectedDocIds((prev) => {
                                  const next = new Set(prev)
                                  isChecked ? next.delete(doc.id) : next.add(doc.id)
                                  return next
                                })
                              }}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-all hover:bg-secondary/30 text-left',
                                isChecked && 'bg-primary/5 text-primary'
                              )}
                            >
                              <span className={cn(
                                'h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                                isChecked
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-border/60 bg-background/40'
                              )}>
                                {isChecked && <Check className="h-2.5 w-2.5" />}
                              </span>
                              <span className="truncate">{doc.name}</span>
                            </button>
                          )
                        })}
                      </div>
                      {selectedDocIds.size > 0 && (
                        <div className="px-3 py-2 border-t border-border/30 bg-card/10 text-[10px] text-muted-foreground">
                          Searching {selectedDocIds.size} of {projectDocs.length} document{projectDocs.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isGenerating ? (
                  <Button type="button" variant="destructive" onClick={handleAbort} className="shadow-md flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Stop
                  </Button>
                ) : (
                  <Button type="submit" disabled={!dbReady || !queryText.trim()} className="shadow-md flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground transition-all">
                    <Search className="h-4 w-4" />
                    Query
                  </Button>
                )}
              </div>

              {/* Active filter badge strip */}
              {selectedDocIds.size > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-muted-foreground">Filtering:</span>
                  {projectDocs
                    .filter((d: any) => selectedDocIds.has(d.id))
                    .map((d: any) => (
                      <span
                        key={d.id}
                        className="inline-flex items-center gap-1 text-[10px] bg-primary/10 border border-primary/25 text-primary px-2 py-0.5 rounded-full"
                      >
                        {d.name}
                        <button
                          type="button"
                          onClick={() => setSelectedDocIds((prev) => { const n = new Set(prev); n.delete(d.id); return n })}
                          className="hover:text-destructive transition-colors"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                </div>
            )}
          </form>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
              {/* Left Column: Query History */}
              <div className="lg:col-span-3 flex flex-col min-h-0">
                <Card className="flex-1 bg-card/15 border-border/40 backdrop-blur-md flex flex-col min-h-0 shadow-xl rounded-xl overflow-hidden">
                  <CardHeader className="py-3 border-b border-border/30 bg-card/5 flex items-center justify-between space-y-0 shrink-0">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      Query History
                    </CardTitle>
                    {queryHistory.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearHistory}
                        className="text-[10px] text-muted-foreground hover:text-destructive h-6 px-2 hover:bg-transparent"
                      >
                        Clear
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                    {queryHistory.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-4 py-8 select-none">
                        <FileText className="h-8 w-8 stroke-1 text-muted-foreground/40 mb-2" />
                        <p className="text-xs font-medium text-foreground">No queries yet</p>
                        <p className="text-[10px]">Your query history will appear here.</p>
                      </div>
                    ) : (
                      queryHistory.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleLoadHistoryItem(item)}
                          className={cn(
                            "w-full text-left p-2.5 rounded-lg border text-xs transition-all duration-200 hover:bg-card/40 flex flex-col gap-1 group",
                            activeQuery === item.query
                              ? "border-primary/50 bg-primary/5 text-foreground"
                              : "border-border/20 bg-card/10 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span className="font-medium truncate w-full group-hover:text-primary transition-colors">
                            {item.query}
                          </span>
                          <span className="text-[9px] opacity-70">
                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </button>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Middle Panel: Streamed Answer */}
              <div className="lg:col-span-5 flex flex-col min-h-0 gap-4">
                <Card className="flex-1 bg-card/15 border-border/40 backdrop-blur-md flex flex-col min-h-0 shadow-xl rounded-xl overflow-hidden">
                  <CardHeader className="py-4 border-b border-border/30 bg-card/5 flex-row justify-between items-center space-y-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Local Answer
                    </CardTitle>
                    {statusMessage && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2 bg-secondary/35 px-2.5 py-1 rounded-full border border-border/35">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span>{statusMessage}</span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 text-sm leading-relaxed">
                    {errorMessage && (
                      <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-medium text-sm">Generation Error</p>
                          <p className="text-xs opacity-90">{errorMessage}</p>
                        </div>
                      </div>
                    )}

                    {!activeQuery && !errorMessage && (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-3 py-12 select-none">
                        <BookOpen className="h-10 w-10 stroke-1 text-muted-foreground/60" />
                        <div className="space-y-1 max-w-sm">
                          <p className="font-medium text-sm text-foreground">Ask a question to start</p>
                          <p className="text-xs">Your query will run locally inside your browser, search indexed documents, and synthesize an answer.</p>
                        </div>
                      </div>
                    )}

                    {activeQuery && (
                      <div className="space-y-4">
                        {/* Thinking Section */}
                        {thinkingContent && (
                          <div className="border border-border/40 rounded-lg overflow-hidden bg-secondary/15">
                            <button
                              type="button"
                              onClick={() => setShowThinking(!showThinking)}
                              className="w-full px-4 py-2 bg-secondary/25 border-b border-border/40 flex justify-between items-center hover:bg-secondary/35 transition-colors text-xs font-semibold text-muted-foreground"
                            >
                              <span className="flex items-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                Thinking Process
                              </span>
                              {showThinking ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            {showThinking && (
                              <div className="p-4 font-mono text-xs text-muted-foreground/90 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto border-t border-border/20 bg-background/25">
                                {thinkingContent}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Main Answer Area */}
                        {answerContent && (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed bg-secondary/5 p-4 rounded-lg border border-border/20 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_p]:mb-3 [&_strong]:font-semibold [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold"
                            dangerouslySetInnerHTML={{
                              __html: marked.parse(answerContent, { async: false }) as string
                            }}
                          />
                        )}

                        {isGenerating && !answerContent && !thinkingContent && (
                          <div className="flex items-center gap-2 py-4 text-muted-foreground text-xs justify-center bg-secondary/5 rounded-lg border border-border/20 border-dashed animate-pulse">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Synthesizing response from retrieved knowledge...
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Panel: Retrieval Preview & Sources */}
              <div className="lg:col-span-4 flex flex-col min-h-0">
                <Card className="flex-1 bg-card/15 border-border/40 backdrop-blur-md flex flex-col min-h-0 shadow-xl rounded-xl overflow-hidden">
                  <CardHeader className="py-4 border-b border-border/30 bg-card/5 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      Retrieved Context Sources
                    </CardTitle>
                    {citations.length > 0 && (
                      <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2.5 py-0.5 rounded-full font-semibold border border-emerald-500/20 flex items-center gap-1 select-none">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {citations.length} Chunks
                      </span>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                    {citations.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-3 py-12 select-none">
                        <FileText className="h-10 w-10 stroke-1 text-muted-foreground/60" />
                        <div className="space-y-1 max-w-xs">
                          <p className="font-medium text-sm text-foreground">No references loaded</p>
                          <p className="text-xs">Run a search query to view the source document chunks retrieved by pgvector similarity search.</p>
                        </div>
                      </div>
                    ) : (
                      citations.map((c, index) => {
                        const isSelected = selectedCitationIndex === index
                        const matchSource = c.source === 'hybrid'
                          ? 'Hybrid Search'
                          : c.source === 'vector'
                            ? 'Semantic Search'
                            : 'Keyword Search'

                        return (
                          <Card
                            key={c.chunkId}
                            className={`p-4 cursor-pointer transition-all duration-200 border bg-card/25 backdrop-blur-sm shadow-sm rounded-lg hover:shadow-md ${isSelected
                                ? 'border-primary ring-1 ring-primary/45 bg-primary/5'
                                : 'border-border/30 hover:border-border/60 hover:bg-card/40'
                              }`}
                            onClick={() => setSelectedCitationIndex(isSelected ? null : index)}
                          >
                            <div className="flex justify-between items-start gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className="h-5 w-5 text-xs font-semibold rounded bg-primary text-primary-foreground flex items-center justify-center shadow-sm select-none">
                                  {index + 1}
                                </span>
                                <div className="space-y-0.5">
                                  <h4 className="font-semibold text-xs text-foreground truncate max-w-[200px]" title={c.documentName}>
                                    {c.documentName}
                                  </h4>
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                    {c.metadata.pageNumber ? (
                                      <span>Page {c.metadata.pageNumber}</span>
                                    ) : (
                                      <span>Text File</span>
                                    )}
                                    <span>•</span>
                                    <span className="font-mono text-primary/80">{matchSource}</span>
                                  </p>
                                </div>
                              </div>
                              <div className="text-[10px] bg-secondary/50 px-2 py-0.5 rounded border border-border/30 text-muted-foreground font-mono">
                                Score: {c.score.toFixed(4)}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground/90 leading-relaxed font-sans line-clamp-3 hover:line-clamp-none transition-all duration-300">
                              {c.text}
                            </p>
                          </Card>
                        )
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
        </>
      )}
    </div>
  )
}
