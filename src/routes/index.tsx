import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Search, Activity, Cpu, ChevronDown, Clock } from 'lucide-react'
import { isDbInitialized, getDb } from '@/db/client'
import { loadPreferences } from '@/lib/preferences'
import { getEmbeddingModelConfig } from '@/rag/embedding-models'
import { marked } from 'marked'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
  component: DashboardComponent,
})

function DashboardComponent() {
  const [dbReady, setDbReady] = useState(isDbInitialized())
  const prefs = loadPreferences()
  const modelConfig = getEmbeddingModelConfig(prefs.embeddingModelId)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: history = [] } = useQuery({
    queryKey: ['dashboard-history', dbReady],
    queryFn: async () => {
      if (!dbReady) return []
      const db = getDb()
      const res = await db.query<any>(
        'SELECT * FROM query_history ORDER BY created_at DESC LIMIT 5'
      )
      return res.rows
    },
    enabled: dbReady,
    refetchInterval: 3000,
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

  const { data: stats = { docs: 0, chunks: 0 } } = useQuery({
    queryKey: ['dashboard-stats', dbReady],
    queryFn: async () => {
      if (!dbReady) return { docs: 0, chunks: 0 }
      const db = getDb()
      const docCountRes = await db.query<any>('SELECT count(*) as count FROM documents')
      const chunkCountRes = await db.query<any>('SELECT count(*) as count FROM chunks')
      return {
        docs: parseInt(docCountRes.rows[0].count) || 0,
        chunks: parseInt(chunkCountRes.rows[0].count) || 0,
      }
    },
    enabled: dbReady,
    refetchInterval: 3000,
  })

  const statsItems = [
    {
      title: 'Total Documents',
      value: stats.docs.toString(),
      description: 'Files uploaded locally',
      icon: FileText,
    },
    {
      title: 'Total Chunks',
      value: stats.chunks.toString(),
      description: 'Extracted text passages',
      icon: Cpu,
    },
    {
      title: 'Embedding Model',
      value: modelConfig?.displayName || 'None selected',
      description: 'Active embedding model',
      icon: Activity,
    },
  ]

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
          Welcome to Browser RAG
        </h2>
        <p className="text-muted-foreground text-sm max-w-2xl">
          A fully client-side, local-first Retrieval-Augmented Generation application. All document processing, vector search, and LLM generation happen entirely within your browser. No data ever leaves your device.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {statsItems.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index} className="bg-card/50 border-border/50 backdrop-blur-sm relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-border group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Icon className="h-24 w-24 text-primary" />
              </div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono tracking-tight">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Recent Queries */}
        <div className="md:col-span-8 flex flex-col gap-4">
          <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Recent Queries
          </h3>
          <Card className="bg-card/25 border-border/40 backdrop-blur-md shadow-lg rounded-xl overflow-hidden flex-1">
            <CardContent className="p-6 space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm flex flex-col items-center justify-center gap-3">
                  <Search className="h-8 w-8 stroke-1 text-muted-foreground/60" />
                  <span>No query history found. Try asking a question in the Search tab!</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => {
                    const isExpanded = expandedId === item.id
                    return (
                      <div key={item.id} className="border-b border-border/30 pb-4 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start gap-4 mb-2">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="font-medium text-sm text-foreground hover:text-primary transition-colors text-left flex items-center gap-1.5 focus:outline-none"
                          >
                            <span>{item.query}</span>
                            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 shrink-0 text-muted-foreground", isExpanded && "rotate-180")} />
                          </button>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap pt-0.5">
                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {isExpanded ? (
                          <div className="space-y-3 mt-3 animate-fade-in bg-secondary/15 p-4 rounded-lg border border-border/20">
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none text-foreground text-xs leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
                              dangerouslySetInnerHTML={{
                                __html: marked.parse(item.answer || '', { async: false }) as string
                              }}
                            />
                            <div className="flex items-center gap-3 pt-2 border-t border-border/10 text-[9px] text-muted-foreground font-mono">
                              <span>LLM: {item.llm_model_id}</span>
                              <span>•</span>
                              <span>Embedding: {item.embedding_model_id}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {item.answer}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="md:col-span-4 flex flex-col gap-4">
          <h3 className="text-lg font-semibold tracking-tight">Quick Actions</h3>
          <div className="space-y-4 flex-1">
            <Card className="bg-card/25 border-border/40 backdrop-blur-md shadow-lg rounded-xl overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Search & Ask Questions</CardTitle>
                <CardDescription className="text-xs">
                  Query your indexed documents using local semantic search.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to="/search">
                  <Button className="w-full flex items-center gap-2 text-xs h-9">
                    <Search className="h-3.5 w-3.5" />
                    Go to Search
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="bg-card/25 border-border/40 backdrop-blur-md shadow-lg rounded-xl overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Manage Documents</CardTitle>
                <CardDescription className="text-xs">
                  Upload files to chunk and index into PGlite.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to="/documents">
                  <Button variant="secondary" className="w-full flex items-center gap-2 text-xs h-9">
                    <FileText className="h-3.5 w-3.5" />
                    Go to Documents
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
