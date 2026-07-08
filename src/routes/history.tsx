import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { getDb, isDbInitialized } from '@/db/client'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { History, Trash2, Search, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useSystemInit } from '@/context/system-init-context'

export const Route = createFileRoute('/history')({
  component: HistoryComponent,
})

function HistoryComponent() {
  const [dbReady, setDbReady] = useState(isDbInitialized())
  const navigate = useNavigate({ from: '/history' })
  const { activeProject } = useSystemInit()

  useEffect(() => {
    if (dbReady) return
    const iv = setInterval(() => { if (isDbInitialized()) { setDbReady(true); clearInterval(iv) } }, 200)
    return () => clearInterval(iv)
  }, [dbReady])

  const { data: queryHistory = [], refetch, isLoading } = useQuery({
    queryKey: ['query-history-full', dbReady, activeProject?.id],
    queryFn: async () => {
      if (!dbReady || !activeProject) return []
      const db = getDb()
      const res = await db.query<any>(
        'SELECT * FROM query_history WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100',
        [activeProject.id]
      )
      return res.rows
    },
    enabled: dbReady && !!activeProject,
  })

  const handleClearHistory = async () => {
    if (!dbReady || !activeProject) return
    if (!confirm('Are you sure you want to clear the history for this project?')) return
    try {
      const db = getDb()
      await db.query('DELETE FROM query_history WHERE project_id = $1', [activeProject.id])
      refetch()
    } catch (err) {
      console.error('Failed to clear query history:', err)
    }
  }

  const handleOpenQuery = (id: string) => {
    navigate({ to: '/', search: { historyId: id } })
  }

  if (!dbReady || isLoading || !activeProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Query History</h1>
          <p className="text-muted-foreground text-sm">Review your past searches and conversations</p>
        </div>
        {queryHistory.length > 0 && (
          <button
            type="button"
            onClick={handleClearHistory}
            className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg text-sm font-medium transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Clear History
          </button>
        )}
      </div>

      {queryHistory.length === 0 ? (
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center">
            <History className="h-12 w-12 text-muted-foreground/20 mb-4" />
            <p className="text-lg font-medium text-foreground">No history yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Your search history will appear here once you start querying your documents.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {queryHistory.map((item: any) => (
            <Card
              key={item.id}
              className="border-border/40 bg-card/40 hover:bg-card/60 backdrop-blur-sm shadow-sm cursor-pointer transition-all hover:border-primary/30 group"
              onClick={() => handleOpenQuery(item.id)}
            >
              <CardContent className="p-4 sm:p-6 flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Search className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-base line-clamp-1 group-hover:text-primary transition-colors">
                    {item.query}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {item.answer ? item.answer.replace(/<[^>]*>?/gm, '') : 'No answer generated'}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground/70">
                    <span className="flex items-center gap-1">
                      <History className="h-3.5 w-3.5" />
                      {new Date(item.created_at).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
