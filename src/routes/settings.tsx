import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, CheckCircle2, Cpu, RefreshCw, Database, XCircle, ShieldCheck } from 'lucide-react'
import { type Preferences } from '@/lib/preferences'
import { LLM_OPTIONS, getLLMOption } from '@/llm/llm-models'
import { useSystemInit } from '@/context/system-init-context'
import { isDbInitialized, getDb } from '@/db/client'

export const Route = createFileRoute('/settings')({
  component: SettingsComponent,
})

function SettingsComponent() {
  const { preferences: prefs, updatePreferences, activeProject, updateActiveProject } = useSystemInit()
  const [isSaved, setIsSaved] = useState(false)

  // Database status state
  const [dbStatus, setDbStatus] = useState({
    initialized: false,
    version: 0,
    tables: {} as Record<string, number>,
    error: null as string | null,
  })
  const [checking, setChecking] = useState(false)

  // Browser capabilities state
  const [capabilities, setCapabilities] = useState({
    webGpu: false,
    webWorkers: false,
    indexedDb: false,
    wasmMultiThreading: false,
  })

  const handleSavePrefs = (newPrefs: Partial<Preferences>) => {
    updatePreferences(newPrefs)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const handleSaveProject = async (updates: any) => {
    if (!activeProject) return
    await updateActiveProject(updates)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

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
    // Detect browser capabilities dynamically
    setCapabilities({
      webGpu: typeof navigator !== 'undefined' && !!navigator.gpu,
      webWorkers: typeof Worker !== 'undefined',
      indexedDb: typeof indexedDB !== 'undefined',
      wasmMultiThreading: typeof SharedArrayBuffer !== 'undefined',
    })

    checkDatabase()
    // Poll every 5 seconds for updates
    const interval = setInterval(checkDatabase, 5000)
    return () => clearInterval(interval)
  }, [])

  const selectedOpt = getLLMOption(prefs.llmVariantId)

  return (
    <div className='space-y-6 animate-fade-in max-w-4xl'>
      <div>
        <p className='text-muted-foreground text-sm'>
          Configure model parameters, chunking preferences, and local LLM settings.
        </p>
      </div>

      <div className='grid gap-6 md:grid-cols-2'>
        {/* RAG Pipeline Config */}
        <Card className='bg-card/25 border-border/40 backdrop-blur-md shadow-lg rounded-xl overflow-hidden'>
          <CardHeader className='py-4 border-b border-border/30 bg-card/5'>
            <CardTitle className='text-sm font-semibold flex items-center gap-2'>
              <Cpu className='h-4 w-4 text-primary' />
              Retrieval &amp; Chunking Configuration
            </CardTitle>
            <CardDescription className='text-xs'>Adjust chunk segmentation boundaries and hybrid rank parameters.</CardDescription>
          </CardHeader>
          <CardContent className='p-6 space-y-4'>
            <div className='space-y-2'>
              <label className='text-xs font-semibold text-muted-foreground'>Chunk Size (Characters)</label>
              <Input
                type='number'
                value={activeProject?.chunkSize ?? 500}
                onChange={(e) => handleSaveProject({ chunkSize: parseInt(e.target.value) || 500 })}
                className='bg-background/50 border-border/45 h-9 text-xs'
                disabled={!activeProject}
              />
              <p className='text-[10px] text-muted-foreground'>Maximum length of text segments.</p>
            </div>

            <div className='space-y-2'>
              <label className='text-xs font-semibold text-muted-foreground'>Chunk Overlap (Characters)</label>
              <Input
                type='number'
                value={activeProject?.chunkOverlap ?? 100}
                onChange={(e) => handleSaveProject({ chunkOverlap: parseInt(e.target.value) || 100 })}
                className='bg-background/50 border-border/45 h-9 text-xs'
                disabled={!activeProject}
              />
              <p className='text-[10px] text-muted-foreground'>Buffer overlap size to preserve context between chunks.</p>
            </div>

            <div className='space-y-2'>
              <label className='text-xs font-semibold text-muted-foreground'>Retrieval Limit (Top-K)</label>
              <Input
                type='number'
                value={activeProject?.retrievalTopK ?? 5}
                onChange={(e) => handleSaveProject({ retrievalTopK: parseInt(e.target.value) || 5 })}
                className='bg-background/50 border-border/45 h-9 text-xs'
                disabled={!activeProject}
              />
              <p className='text-[10px] text-muted-foreground'>Number of chunks fed to the LLM context.</p>
            </div>

            <div className='flex items-center justify-between p-3.5 bg-secondary/20 rounded-lg border border-border/35 mt-2'>
              <div className='space-y-0.5 pr-2'>
                <label className='text-xs font-semibold text-foreground'>Hybrid Retrieval (RRF)</label>
                <p className='text-[10px] text-muted-foreground leading-snug'>Fuse semantic vector search with keyword exact matches.</p>
              </div>
              <button
                type='button'
                disabled={!activeProject}
                onClick={() => handleSaveProject({ hybridRetrievalEnabled: !activeProject?.hybridRetrievalEnabled })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${activeProject?.hybridRetrievalEnabled ? 'bg-primary' : 'bg-secondary'
                  }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${activeProject?.hybridRetrievalEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* LLM settings */}
        <Card className='bg-card/25 border-border/40 backdrop-blur-md shadow-lg rounded-xl overflow-hidden flex flex-col'>
          <CardHeader className='py-4 border-b border-border/30 bg-card/5 shrink-0'>
            <CardTitle className='text-sm font-semibold flex items-center gap-2'>
              <Cpu className='h-4 w-4 text-primary' />
              Local LLM Settings
            </CardTitle>
            <CardDescription className='text-xs'>Choose active local generation model and backend engine.</CardDescription>
          </CardHeader>
          <CardContent className='p-6 space-y-4 flex-1 flex flex-col justify-between'>
            <div className='space-y-4'>
              <div className='space-y-2'>
                <label className='text-xs font-semibold text-muted-foreground'>Select Model Option</label>
                <select
                  value={prefs.llmVariantId}
                  onChange={(e) => handleSavePrefs({ llmVariantId: e.target.value, llmModelId: getLLMOption(e.target.value).logicalModelId })}
                  className='w-full px-3 py-2 text-xs bg-background/50 border border-border/45 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors h-9 text-foreground'
                >
                  {LLM_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} ({opt.variantLabel ?? opt.engineType}) • {opt.sizeLabel}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Option details */}
              <div className='p-4 bg-secondary/15 rounded-lg border border-border/20 space-y-3'>
                <div className='flex justify-between items-center text-xs'>
                  <span className='font-semibold text-foreground'>{selectedOpt.name}</span>
                  <span className='text-[9px] bg-secondary/80 text-muted-foreground border border-border/30 px-1.5 py-0.2 rounded font-mono uppercase'>
                    {selectedOpt.engineType}
                  </span>
                </div>
                <p className='text-[10px] text-muted-foreground leading-relaxed'>
                  Size: {selectedOpt.sizeLabel} • Context Limit: {selectedOpt.tokenLimits.text} tokens
                </p>
                {selectedOpt.requirements.length > 0 && (
                  <div className='flex flex-wrap gap-1.5'>
                    {selectedOpt.requirements.map((req) => {
                      const isGood = req === 'webgpu' || req === 'mobile-friendly'
                      return (
                        <span
                          key={req}
                          className={`text-[8px] px-1.5 py-0.5 rounded font-semibold uppercase border ${isGood
                              ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-500/90'
                              : 'border-orange-500/25 bg-orange-500/5 text-orange-500/90'
                            }`}
                        >
                          {req}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className='flex justify-end pt-4 shrink-0'>
              <Button
                onClick={() => {
                  setIsSaved(true)
                  setTimeout(() => setIsSaved(false), 2000)
                }}
                className='shadow-md flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground select-none w-full sm:w-auto h-9 text-xs'
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 className='h-4 w-4' />
                    Configuration Saved!
                  </>
                ) : (
                  <>
                    <Save className='h-4 w-4' />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Capabilities & Diagnostics */}
      <Card className='bg-card/25 border-border/40 backdrop-blur-md shadow-lg rounded-xl overflow-hidden'>
        <CardHeader className='py-4 border-b border-border/30 bg-card/5 flex flex-row items-center justify-between gap-4'>
          <div>
            <CardTitle className='text-sm font-semibold flex items-center gap-2'>
              <Database className='h-4 w-4 text-primary' />
              System Capabilities &amp; Diagnostics
            </CardTitle>
            <CardDescription className='text-xs'>Monitor browser features and local database statistics.</CardDescription>
          </div>
          <Button
            size='sm'
            variant='outline'
            onClick={checkDatabase}
            disabled={checking}
            className='flex items-center gap-1.5 h-8 text-[11px] px-3'
          >
            <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        </CardHeader>
        <CardContent className='p-6'>
          <div className='grid gap-6 md:grid-cols-2'>
            {/* Browser capabilities sub-section */}
            <div className='space-y-3.5 text-xs'>
              <h4 className='font-semibold text-xs text-foreground/80 flex items-center gap-1.5 pb-1 border-b border-border/30'>
                <ShieldCheck className='h-4 w-4 text-emerald-500' />
                Browser APIs &amp; Environment
              </h4>
              <div className='flex justify-between border-b border-border/20 pb-2'>
                <span>WebGPU Support</span>
                <span className={`font-semibold font-mono flex items-center gap-1 ${capabilities.webGpu ? 'text-emerald-500' : 'text-orange-500'}`}>
                  <CheckCircle2 className='h-3.5 w-3.5' /> {capabilities.webGpu ? 'Available' : 'Unavailable'}
                </span>
              </div>
              <div className='flex justify-between border-b border-border/20 pb-2'>
                <span>Web Workers</span>
                <span className={`font-semibold font-mono flex items-center gap-1 ${capabilities.webWorkers ? 'text-emerald-500' : 'text-orange-500'}`}>
                  <CheckCircle2 className='h-3.5 w-3.5' /> {capabilities.webWorkers ? 'Supported' : 'Unsupported'}
                </span>
              </div>
              <div className='flex justify-between border-b border-border/20 pb-2'>
                <span>IndexedDB Storage</span>
                <span className={`font-semibold font-mono flex items-center gap-1 ${capabilities.indexedDb ? 'text-emerald-500' : 'text-orange-500'}`}>
                  <CheckCircle2 className='h-3.5 w-3.5' /> {capabilities.indexedDb ? 'Available' : 'Unavailable'}
                </span>
              </div>
              <div className='flex justify-between pb-1'>
                <span>WASM Multi-threading (COOP/COEP)</span>
                <span className={`font-semibold font-mono flex items-center gap-1 ${capabilities.wasmMultiThreading ? 'text-emerald-500' : 'text-orange-500'}`}>
                  <CheckCircle2 className='h-3.5 w-3.5' /> {capabilities.wasmMultiThreading ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            {/* Database diagnostics sub-section */}
            <div className='space-y-3.5 text-xs'>
              <h4 className='font-semibold text-xs text-foreground/80 flex items-center gap-1.5 pb-1 border-b border-border/30'>
                <Database className='h-4 w-4 text-primary' />
                Database Engine (PGlite)
              </h4>
              {dbStatus.error && !dbStatus.initialized ? (
                <div className='flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg text-xs border border-destructive/20'>
                  <XCircle className='h-4 w-4 shrink-0' />
                  <span>{dbStatus.error}</span>
                </div>
              ) : (
                <>
                  <div className='flex justify-between border-b border-border/20 pb-2'>
                    <span>Connection Status</span>
                    <span className='text-emerald-500 font-semibold font-mono flex items-center gap-1'>
                      <CheckCircle2 className='h-3.5 w-3.5' /> Connected
                    </span>
                  </div>
                  <div className='flex justify-between border-b border-border/20 pb-2'>
                    <span>Schema Version</span>
                    <span className='font-mono font-semibold text-foreground'>v{dbStatus.version}</span>
                  </div>

                  <div className='space-y-1.5 pt-1.5'>
                    <h5 className='font-medium text-[10px] text-muted-foreground uppercase tracking-wider'>
                      Table Row Counts
                    </h5>
                    <div className='grid grid-cols-2 gap-2 text-[11px] bg-secondary/10 p-2.5 rounded-lg border border-border/20'>
                      {Object.entries(dbStatus.tables).map(([table, count]) => (
                        <div key={table} className='flex justify-between border-b border-border/10 pb-0.5 last:border-0 last:pb-0'>
                          <span className='font-mono text-muted-foreground'>{table}:</span>
                          <span className='font-mono font-semibold text-foreground pr-1'>{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
