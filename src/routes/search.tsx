import { useState, useRef, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Loader2, Sparkles, BookOpen, ChevronDown, ChevronUp, AlertCircle, FileText, CheckCircle2 } from 'lucide-react'
import { isDbInitialized } from '@/db/client'
import { loadPreferences } from '@/lib/preferences'
import { getLLMVariant, getLLMOption } from '@/llm/llm-models'
import { generateRAGAnswer } from '@/rag/orchestrator'
import { useGemma4 } from '@/hooks/use-gemma4'
import { useWebLLM } from '@/hooks/use-webllm'
import { useLfm2 } from '@/hooks/use-lfm2'
import { useQwen35 } from '@/hooks/use-qwen35'
import type { LLMRuntimeHandles } from '@/llm/llm-runtime'

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
  const [loadProgress, setLoadProgress] = useState<number | null>(null)
  const [thinkingContent, setThinkingContent] = useState('')
  const [answerContent, setAnswerContent] = useState('')
  const [citations, setCitations] = useState<any[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showThinking, setShowThinking] = useState(true)
  const [selectedCitationIndex, setSelectedCitationIndex] = useState<number | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Initialize Engines
  const gemma4 = useGemma4()
  const webllm = useWebLLM()
  const lfm2 = useLfm2()
  const qwen35 = useQwen35()

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

  // Get active engine hook and progress
  const prefs = loadPreferences()
  const variant = getLLMVariant(prefs.llmVariantId)
  const option = getLLMOption(prefs.llmVariantId)

  let activeHook: any
  if (variant.engine === 'transformers-js') activeHook = qwen35
  else if (variant.engine === 'webllm') activeHook = webllm
  else if (variant.engine === 'gemma4-kernel') activeHook = gemma4
  else if (variant.engine === 'lfm2-kernel') activeHook = lfm2

  // Sync loading progress
  useEffect(() => {
    if (activeHook?.isLoading) {
      setLoadProgress(activeHook.loadProgress)
    } else {
      setLoadProgress(null)
    }
  }, [activeHook?.isLoading, activeHook?.loadProgress])

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
      // 1. Ensure LLM is loaded
      if (!activeHook.isReady) {
        setStatusMessage(`Loading weights for ${option.name}...`)
        const success = await activeHook.loadModel(variant.engineModelId)
        if (!success) {
          throw new Error(`Failed to load LLM model: ${option.name}`)
        }
      }

      setStatusMessage('Searching and fusing documents...')

      // 2. Run RAG Pipeline
      const stream = generateRAGAnswer(queryText, {
        abortSignal: abortController.signal,
        llmHandles: getLLMHandles(),
      })

      setStatusMessage('Streaming answer...')
      for await (const chunk of stream) {
        if (abortController.signal.aborted) break

        if (chunk.type === 'citations' && chunk.citations) {
          setCitations(chunk.citations)
        } else if (chunk.type === 'thinking_delta' && chunk.text) {
          setThinkingContent((prev) => prev + chunk.text)
        } else if (chunk.type === 'text_delta' && chunk.text) {
          setAnswerContent((prev) => prev + chunk.text)
        } else if (chunk.type === 'error' && chunk.error) {
          throw new Error(chunk.error)
        }
      }

      setStatusMessage(null)
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
    activeHook?.abort()
    setIsGenerating(false)
    setStatusMessage('Generation cancelled')
    setTimeout(() => setStatusMessage(null), 2000)
  }

  return (
    <div className="space-y-6 flex flex-col flex-1 h-full min-h-0 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Search & Chat</h2>
          <p className="text-muted-foreground text-sm">
            Query your local documents with pgvector semantic search and keyword fusion.
          </p>
        </div>
        <Card className="px-4 py-2 bg-secondary/35 border-border/40 text-xs flex items-center gap-2 select-none">
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
          <span>Active LLM: <strong className="font-semibold text-foreground">{option.name}</strong> ({variant.label})</span>
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping ml-1" />
        </Card>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Ask a question about your documents..."
          className="flex-1 bg-background/50 border-border/40 focus:ring-primary focus:border-primary shadow-sm"
          disabled={isGenerating || !dbReady}
        />
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
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left Panel: Streamed Answer */}
        <div className="lg:col-span-7 flex flex-col min-h-0 gap-4">
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
                  {loadProgress !== null && <span className="font-mono">{loadProgress}%</span>}
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
                    <div className="prose prose-sm dark:prose-invert max-w-none text-foreground whitespace-pre-wrap leading-relaxed bg-secondary/5 p-4 rounded-lg border border-border/20">
                      {answerContent}
                    </div>
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
        <div className="lg:col-span-5 flex flex-col min-h-0">
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
                      className={`p-4 cursor-pointer transition-all duration-200 border bg-card/25 backdrop-blur-sm shadow-sm rounded-lg hover:shadow-md ${
                        isSelected
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
    </div>
  )
}
