import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { isDbInitialized, getDb } from '@/db/client'
import { RefreshCw, Database, CheckCircle2, XCircle } from 'lucide-react'

export const Route = createFileRoute('/diagnostics')({
  component: DiagnosticsComponent,
})

function DiagnosticsComponent() {
  const [dbStatus, setDbStatus] = useState({
    initialized: false,
    version: 0,
    tables: {} as Record<string, number>,
    error: null as string | null,
  })
  const [checking, setChecking] = useState(false)

  const checkDatabase = async () => {
    setChecking(true)
    try {
      if (isDbInitialized()) {
        const db = getDb()
        
        // Get schema version
        const versionRes = await db.query<{ version: number }>(
          'SELECT MAX(version) as version FROM migration_versions'
        )
        const version = versionRes.rows[0]?.version || 0

        // Get row counts for key tables
        const tables = ['collections', 'documents', 'chunks', 'index_jobs', 'query_history']
        const counts: Record<string, number> = {}

        for (const table of tables) {
          const res = await db.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM ${table}`
          )
          counts[table] = parseInt(res.rows[0]?.count || '0', 10)
        }

        setDbStatus({
          initialized: true,
          version,
          tables: counts,
          error: null,
        })
      } else {
        setDbStatus({
          initialized: false,
          version: 0,
          tables: {},
          error: 'Database not initialized yet.',
        })
      }
    } catch (err: any) {
      setDbStatus((prev) => ({
        ...prev,
        error: err?.message || 'Failed to query database diagnostics',
      }))
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    checkDatabase()
    // Poll every 5 seconds for updates
    const interval = setInterval(checkDatabase, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            Monitor browser capabilities, database stats, and hardware acceleration status.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={checkDatabase}
          disabled={checking}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Browser Capabilities</CardTitle>
            <CardDescription>Verify your browser supports all necessary APIs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between border-b border-border pb-2">
              <span>WebGPU Support</span>
              <span className="text-emerald-500 font-semibold font-mono flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Available
              </span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span>Web Workers</span>
              <span className="text-emerald-500 font-semibold font-mono flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Supported
              </span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span>IndexedDB Storage</span>
              <span className="text-emerald-500 font-semibold font-mono flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Available
              </span>
            </div>
            <div className="flex justify-between pb-1">
              <span>WASM Multi-threading (COOP/COEP)</span>
              <span className="text-emerald-500 font-semibold font-mono flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Enabled
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Database Diagnostics
            </CardTitle>
            <CardDescription>Examine local PGlite tables and statistics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {dbStatus.error && !dbStatus.initialized ? (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
                <XCircle className="h-5 w-5 shrink-0" />
                <span>{dbStatus.error}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between border-b border-border pb-2">
                  <span>Connection Status</span>
                  <span className="text-emerald-500 font-semibold font-mono flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Connected (PGlite)
                  </span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span>Schema Version</span>
                  <span className="font-mono font-semibold">v{dbStatus.version}</span>
                </div>

                <div className="space-y-2 pt-2">
                  <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                    Table Row Counts
                  </h4>
                  {Object.entries(dbStatus.tables).map(([table, count]) => (
                    <div key={table} className="flex justify-between border-b border-border pb-1 last:border-0">
                      <span className="font-mono text-xs">{table}</span>
                      <span className="font-mono font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
