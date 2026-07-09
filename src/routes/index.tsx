import { useState, useRef, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Search,
  Loader2,
  Sparkles,
  BookOpen,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileText,
  Cpu,
  Layers,
  X,
  Check,
  Send,
  Copy,
  CheckCircle2,
} from 'lucide-react'
import { getDb, isDbInitialized } from '@/db/client'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { getLLMVariant, getLLMOption, LLM_OPTIONS } from '@/llm/llm-models'
import { EMBEDDING_MODELS } from '@/rag/embedding-models'
import { generateRAGAnswer } from '@/rag/orchestrator'
import { useSystemInit } from '@/context/system-init-context'
import type { LLMRuntimeHandles } from '@/llm/llm-runtime'
import { marked } from 'marked'

export const Route = createFileRoute('/')({
  component: ChatComponent,
  validateSearch: (search: Record<string, unknown>): { historyId?: string; clear?: string } => {
    return {
      historyId: (search.historyId as string) || undefined,
      clear: (search.clear as string) || undefined,
    }
  },
})

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  citations?: any[]
  timestamp: Date
  isStreaming?: boolean
}

// ── Source pill with hover tooltip ──────────────────────────────────────────
function SourcePill({ citation, index }: { citation: any; index: number }) {
  const [hovered, setHovered] = useState(false)
  const pillRef = useRef<HTMLDivElement>(null)
  const [tooltipLeft, setTooltipLeft] = useState(true)

  const matchSource =
    citation.source === 'hybrid'
      ? 'Hybrid'
      : citation.source === 'vector'
        ? 'Semantic'
        : 'Keyword'

  useEffect(() => {
    if (!hovered || !pillRef.current) return
    const rect = pillRef.current.getBoundingClientRect()
    setTooltipLeft(rect.left + 288 < window.innerWidth)
  }, [hovered])

  return (
    <div
      ref={pillRef}
      className="relative inline-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="inline-flex items-center gap-1 text-[10px] bg-secondary/40 hover:bg-primary/10 border border-border/30 hover:border-primary/30 text-muted-foreground hover:text-primary px-2 py-0.5 rounded-full cursor-default transition-all duration-200 select-none">
        <FileText className="h-2.5 w-2.5 shrink-0" />
        <span className="max-w-[100px] truncate">{citation.documentName}</span>
        {citation.metadata?.pageNumber && (
          <span className="opacity-60">p.{citation.metadata.pageNumber}</span>
        )}
        <span className="font-bold text-primary/60">[{index + 1}]</span>
      </span>

      {hovered && (
        <div
          className={cn(
            'absolute bottom-full mb-2 z-50 w-72 rounded-xl border border-border/40 bg-popover/98 backdrop-blur-md shadow-2xl overflow-hidden pointer-events-none',
            tooltipLeft ? 'left-0' : 'right-0'
          )}
        >
          <div className="px-3 py-2 border-b border-border/30 bg-muted/30 flex items-start justify-between gap-2">
            <span className="text-[10px] font-semibold text-foreground leading-snug break-all">
              {citation.documentName}
            </span>
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              {citation.metadata?.pageNumber && (
                <span className="text-[9px] bg-secondary/60 px-1.5 py-0.5 rounded text-muted-foreground whitespace-nowrap">
                  p.{citation.metadata.pageNumber}
                </span>
              )}
              <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono whitespace-nowrap">
                {matchSource}
              </span>
              <span className="text-[9px] text-muted-foreground/70 font-mono">
                {citation.score?.toFixed(3)}
              </span>
            </div>
          </div>
          <p className="p-3 text-[10px] text-muted-foreground leading-relaxed max-h-36 overflow-y-auto">
            {citation.text}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Individual chat bubble ───────────────────────────────────────────────────
function ChatBubble({ message, onCopy }: { message: ChatMessage; onCopy: (t: string) => void }) {
  const [showThinking, setShowThinking] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (message.role === 'user') {
    return (
      <div className="flex items-end justify-end gap-2.5 group">
        <div className="max-w-[85%] md:max-w-[70%] flex flex-col items-end gap-1">
          <div className="bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed shadow-md">
            {message.content}
          </div>
          <span className="text-[9px] text-muted-foreground/50 pr-1">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mb-4">
          <span className="text-[9px] font-bold text-primary select-none">You</span>
        </div>
      </div>
    )
  }

  // Assistant bubble
  return (
    <div className="flex items-start gap-2.5 group">
      <div className="h-7 w-7 rounded-full bg-secondary border border-border/40 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </div>

      <div className="max-w-[90%] md:max-w-[80%] flex flex-col gap-1.5 min-w-0">
        {/* Thinking */}
        {message.thinking && (
          <div className="border border-border/30 rounded-xl overflow-hidden bg-muted/20 text-xs">
            <button
              type="button"
              onClick={() => setShowThinking(!showThinking)}
              className="w-full px-3 py-1.5 flex justify-between items-center hover:bg-muted/30 transition-colors text-muted-foreground font-medium"
            >
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 text-primary/60" />
                Thinking Process
              </span>
              {showThinking ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showThinking && (
              <div className="px-3 py-2 font-mono text-[10px] text-muted-foreground/80 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto border-t border-border/20">
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {/* Streaming placeholder */}
        {message.isStreaming && !message.content && !message.thinking && (
          <div className="px-4 py-3 bg-card border border-border/30 rounded-2xl rounded-tl-sm flex items-center gap-2 text-xs text-muted-foreground shadow-sm">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}

        {/* Main answer */}
        {message.content && (
          <div className="px-4 py-3 bg-card border border-border/30 rounded-2xl rounded-tl-sm shadow-sm">
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_p]:mb-3 [&_strong]:font-semibold [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_p:last-child]:mb-0 [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
              dangerouslySetInnerHTML={{ __html: marked.parse(message.content, { async: false }) as string }}
            />
          </div>
        )}

        {/* Source pills */}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-col gap-1 mt-0.5">
            <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider flex items-center gap-1">
              <BookOpen className="h-2.5 w-2.5" />
              Sources
            </span>
            <div className="flex flex-wrap gap-1.5">
              {message.citations.map((c: any, i: number) => (
                <SourcePill key={c.chunkId ?? i} citation={c} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Timestamp + copy */}
        {message.content && (
          <div className="flex items-center gap-2 pl-1">
            <span className="text-[9px] text-muted-foreground/40">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-primary"
              title="Copy answer"
            >
              {copied
                ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                : <Copy className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
function ChatComponent() {
  const [dbReady, setDbReady] = useState(isDbInitialized())
  const [queryText, setQueryText] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Document filter
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  const { historyId, clear } = Route.useSearch()
  const navigate = useNavigate()

  const handleLoadHistoryItem = (item: any) => {
    let parsedCitations: any[] = []
    try { parsedCitations = JSON.parse(item.retrieved_chunks_json || '[]') } catch (_) { }
    setMessages([
      { id: `${item.id}-u`, role: 'user', content: item.query, timestamp: new Date(item.created_at) },
      { id: `${item.id}-a`, role: 'assistant', content: item.answer || '', citations: parsedCitations, timestamp: new Date(item.created_at) },
    ])
    setErrorMessage(null)
    setIsGenerating(false)
  }

  useEffect(() => {
    if (!dbReady || !historyId) return
    const fetchHistoryItem = async () => {
      try {
        const db = getDb()
        const res = await db.query<any>('SELECT * FROM query_history WHERE id = $1', [historyId])
        if (res.rows.length > 0) {
          handleLoadHistoryItem(res.rows[0])
        }
      } catch (err) {
        console.error('Failed to load history item:', err)
      }
    }
    fetchHistoryItem()
  }, [dbReady, historyId])

  const {
    preferences: prefs,
    updatePreferences,
    activeProject,
    gemma4, webllm, lfm2, qwen35,
    isLlmReady, llmLoading, llmProgress, loadLlmModel,
    embeddingReady, embeddingLoading, embeddingProgress, loadEmbeddingModel,
    loadingError, setLoadingError,
  } = useSystemInit()

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
    const iv = setInterval(() => { if (isDbInitialized()) { setDbReady(true); clearInterval(iv) } }, 200)
    return () => clearInterval(iv)
  }, [dbReady])

  useEffect(() => {
    if (!filterOpen) return
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const variant = getLLMVariant(prefs.llmVariantId)
  const option = getLLMOption(prefs.llmVariantId)

  useEffect(() => {
    if (clear) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      let hook: any
      if (variant.engine === 'transformers-js') hook = qwen35
      else if (variant.engine === 'webllm') hook = webllm
      else if (variant.engine === 'gemma4-kernel') hook = gemma4
      else if (variant.engine === 'lfm2-kernel') hook = lfm2
      hook?.abort()

      setMessages([])
      setErrorMessage(null)
      setIsGenerating(false)
      setStatusMessage(null)
      navigate({ to: '/', replace: true })
    }
  }, [clear, navigate, variant.engine, qwen35, webllm, gemma4, lfm2])

  const handleInitialize = async () => {
    setLoadingError(null)
    try {
      if (!embeddingReady) await loadEmbeddingModel()
      if (!isLlmReady) await loadLlmModel()
    } catch (err: any) { console.error('Failed to initialize models:', err) }
  }

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = queryText.trim()
    if (!q || isGenerating) return

    const uId = crypto.randomUUID()
    const aId = crypto.randomUUID()
    const now = new Date()

    setMessages((prev) => [
      ...prev,
      { id: uId, role: 'user', content: q, timestamp: now },
      { id: aId, role: 'assistant', content: '', citations: [], timestamp: now, isStreaming: true },
    ])
    setQueryText('')
    if (inputRef.current) { inputRef.current.style.height = 'auto' }
    setIsGenerating(true)
    setErrorMessage(null)
    setStatusMessage('Searching documents...')

    if (abortControllerRef.current) abortControllerRef.current.abort()
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl

    try {
      const stream = generateRAGAnswer(q, {
        projectId: activeProject?.id ?? '',
        embeddingModelId: activeProject?.embeddingModelId ?? '',
        documentIds: selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined,
        abortSignal: ctrl.signal,
        llmHandles: getLLMHandles(),
      })

      setStatusMessage('Streaming answer...')
      let finalAnswer = ''
      let finalCitations: any[] = []

      for await (const chunk of stream) {
        if (ctrl.signal.aborted) break
        if (chunk.type === 'citations' && chunk.citations) {
          finalCitations = chunk.citations
          setMessages((prev) => prev.map((m) => m.id === aId ? { ...m, citations: chunk.citations } : m))
        } else if (chunk.type === 'thinking_delta' && chunk.text) {
          setMessages((prev) => prev.map((m) => m.id === aId ? { ...m, thinking: (m.thinking ?? '') + chunk.text } : m))
        } else if (chunk.type === 'text_delta' && chunk.text) {
          finalAnswer += chunk.text
          setMessages((prev) => prev.map((m) => m.id === aId ? { ...m, content: m.content + chunk.text } : m))
        } else if (chunk.type === 'error' && chunk.error) {
          throw new Error(chunk.error)
        }
      }

      setMessages((prev) => prev.map((m) => m.id === aId ? { ...m, isStreaming: false } : m))
      setStatusMessage(null)

      if (!ctrl.signal.aborted && isDbInitialized()) {
        try {
          const db = getDb()
          await db.query(
            `INSERT INTO query_history (id, query, answer, retrieved_chunks_json, embedding_model_id, llm_model_id, project_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [crypto.randomUUID(), q, finalAnswer, JSON.stringify(finalCitations),
            activeProject?.embeddingModelId ?? '', prefs.llmVariantId, activeProject?.id ?? null]
          )
        } catch (dbErr) { console.error('Failed to save to history:', dbErr) }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'An error occurred.')
        setMessages((prev) => prev.map((m) => m.id === aId ? { ...m, isStreaming: false } : m))
      }
      setStatusMessage(null)
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }

  const handleAbort = () => {
    abortControllerRef.current?.abort()
    let hook: any
    if (variant.engine === 'transformers-js') hook = qwen35
    else if (variant.engine === 'webllm') hook = webllm
    else if (variant.engine === 'gemma4-kernel') hook = gemma4
    else if (variant.engine === 'lfm2-kernel') hook = lfm2
    hook?.abort()
    setIsGenerating(false)
    setStatusMessage('Cancelled')
    setTimeout(() => setStatusMessage(null), 2000)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch() }
  }

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => { })
  }

  const isLoaded = isLlmReady && embeddingReady
  const isInitializing = llmLoading || embeddingLoading

  // ── Initialization screen ────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 min-h-[400px]">
        <Card className="w-full max-w-xl bg-card/20 border-border/40 backdrop-blur-md shadow-2xl relative overflow-hidden rounded-2xl">
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
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{loadingError}</span>
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary/70" />
                  Embedding Model (Project-locked)
                </label>
                <div className="w-full bg-background/30 border border-border/45 rounded-lg p-2.5 text-xs text-muted-foreground flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {activeProject
                      ? (EMBEDDING_MODELS.find((m) => m.id === activeProject.embeddingModelId)?.displayName ?? activeProject.embeddingModelId)
                      : 'No project selected'}
                  </span>
                  {activeProject && (
                    <span className="text-[10px] bg-secondary/60 border border-border/30 px-1.5 py-0.5 rounded text-muted-foreground">locked</span>
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
                  className="w-full bg-background/50 border border-border/45 rounded-lg p-2.5 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
                >
                  {LLM_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name} ({opt.variantLabel}) • {opt.sizeLabel}</option>
                  ))}
                </select>
              </div>
            </div>
            {isInitializing && (
              <div className="space-y-4 border-t border-border/30 pt-4">
                {!embeddingReady && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin text-primary" />Loading Embedding model...</span>
                      <span className="font-mono text-primary">{embeddingProgress}%</span>
                    </div>
                    <div className="w-full bg-secondary/30 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full transition-all duration-300" style={{ width: `${embeddingProgress}%` }} />
                    </div>
                  </div>
                )}
                {!isLlmReady && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin text-primary" />Downloading LLM weights ({option.name})...</span>
                      <span className="font-mono text-primary">{llmProgress}%</span>
                    </div>
                    <div className="w-full bg-secondary/30 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full transition-all duration-300" style={{ width: `${llmProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {!isInitializing && (
              <Button onClick={handleInitialize} className="w-full h-10 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99]">
                <Sparkles className="h-4 w-4" />
                Initialize AI Engines
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Full-screen chat layout ──────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Main chat area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="w-full px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
            {/* Empty state */}
            {messages.length === 0 && !errorMessage && (
              <div className="flex flex-col items-center justify-center text-center text-muted-foreground space-y-5 pt-12 md:pt-24 select-none">
                <div className="w-16 h-16 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center shadow-inner">
                  <Search className="h-7 w-7 text-primary/50" />
                </div>
                <div className="space-y-2 max-w-sm">
                  <p className="font-semibold text-base text-foreground">Ask anything about your documents</p>
                  <p className="text-sm leading-relaxed opacity-70">
                    Runs entirely in-browser — semantic search + keyword fusion + local LLM.
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Error</p>
                  <p className="text-xs opacity-90 mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} onCopy={handleCopyMessage} />
            ))}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Active filter strip */}
        {selectedDocIds.size > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center px-4 md:px-6 py-1.5 border-t border-border/20 bg-card/10 shrink-0">
            <span className="text-[10px] text-muted-foreground">Filtering:</span>
            {projectDocs.filter((d: any) => selectedDocIds.has(d.id)).map((d: any) => (
              <span key={d.id} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 border border-primary/25 text-primary px-2 py-0.5 rounded-full">
                {d.name}
                <button type="button" onClick={() => setSelectedDocIds((prev) => { const n = new Set(prev); n.delete(d.id); return n })} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 bg-background/80 backdrop-blur-sm border-t border-border/30">
          <div className="w-full">
            {statusMessage && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 bg-secondary/40 px-2.5 py-1 rounded-full border border-border/30 w-fit mb-2">
                <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                {statusMessage}
              </div>
            )}
            <form
              onSubmit={handleSearch}
              className="flex flex-col gap-2 bg-card border border-border/40 rounded-2xl p-3 shadow-lg focus-within:border-primary/40 focus-within:shadow-primary/5 transition-all"
            >
              <div className="flex items-start gap-3">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={queryText}
                  onChange={(e) => {
                    setQueryText(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything... (Enter to send, Shift+Enter for newline)"
                  disabled={isGenerating || !dbReady}
                  className="flex-1 resize-none bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground/40 leading-relaxed py-1 min-h-[28px] max-h-[140px] disabled:opacity-50"
                />
                {isGenerating ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleAbort}
                    className="shrink-0 rounded-xl h-8 px-3 flex items-center gap-1.5 text-xs mt-0.5"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Stop
                  </Button>
                ) : (
                  <button
                    type="submit"
                    disabled={!dbReady || !queryText.trim()}
                    className="shrink-0 h-8 w-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm mt-0.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 pt-2">
                {/* Active LLM badge */}
                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 bg-secondary/30 px-2.5 py-1 rounded-full border border-border/20 select-none">
                  <Cpu className="h-2.5 w-2.5 text-primary" />
                  <span className="font-medium text-foreground">{option.name}</span>
                </div>

                {/* Document filter */}
                <div className="relative" ref={filterRef}>
                  <button
                    type="button"
                    onClick={() => setFilterOpen((o) => !o)}
                    disabled={isGenerating || !dbReady || projectDocs.length === 0}
                    className={cn(
                      'flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border transition-all',
                      selectedDocIds.size > 0
                        ? 'border-primary/40 bg-primary/5 text-primary'
                        : 'border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground',
                      'disabled:opacity-40'
                    )}
                  >
                    <BookOpen className="h-2.5 w-2.5" />
                    {selectedDocIds.size > 0 ? `${selectedDocIds.size} doc${selectedDocIds.size > 1 ? 's' : ''}` : 'All Documents'}
                    {selectedDocIds.size > 0 && (
                      <span
                        role="button"
                        aria-label="Clear filter"
                        onClick={(e) => { e.stopPropagation(); setSelectedDocIds(new Set()) }}
                        className="ml-0.5 hover:text-destructive transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>

                  {filterOpen && projectDocs.length > 0 && (
                    <div className="absolute left-0 bottom-full mb-2 z-50 w-72 rounded-xl border border-border/40 bg-card/98 backdrop-blur-md shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
                        <span className="text-xs font-semibold flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-primary" />Filter by Document</span>
                        <div className="flex items-center gap-1">
                          {selectedDocIds.size > 0 && (
                            <button type="button" onClick={() => setSelectedDocIds(new Set())} className="text-[10px] text-muted-foreground hover:text-destructive px-1.5 py-0.5 rounded">
                              Clear all
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => selectedDocIds.size === projectDocs.length ? setSelectedDocIds(new Set()) : setSelectedDocIds(new Set(projectDocs.map((d: any) => d.id)))}
                            className="text-[10px] text-primary hover:underline px-1.5 py-0.5 rounded"
                          >
                            {selectedDocIds.size === projectDocs.length ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1.5">
                        {projectDocs.map((doc: any) => {
                          const checked = selectedDocIds.has(doc.id)
                          return (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => setSelectedDocIds((prev) => { const n = new Set(prev); checked ? n.delete(doc.id) : n.add(doc.id); return n })}
                              className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-secondary/30 text-left', checked && 'bg-primary/5 text-primary')}
                            >
                              <span className={cn('h-4 w-4 rounded border flex items-center justify-center shrink-0', checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border/60')}>
                                {checked && <Check className="h-2.5 w-2.5" />}
                              </span>
                              <span className="truncate">{doc.name}</span>
                            </button>
                          )
                        })}
                      </div>
                      {selectedDocIds.size > 0 && (
                        <div className="px-3 py-2 border-t border-border/30 text-[10px] text-muted-foreground">
                          Searching {selectedDocIds.size} of {projectDocs.length} document{projectDocs.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </form>
            <p className="text-center text-[9px] text-muted-foreground/40 mt-2 select-none">
              Runs entirely in your browser · No data leaves your device
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
