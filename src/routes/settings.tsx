import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, CheckCircle2, Cpu } from 'lucide-react'
import { type Preferences } from '@/lib/preferences'
import { LLM_OPTIONS } from '@/llm/llm-models'
import { useSystemInit } from '@/context/system-init-context'

export const Route = createFileRoute('/settings')({
  component: SettingsComponent,
})

function SettingsComponent() {
  const { preferences: prefs, updatePreferences } = useSystemInit()
  const [isSaved, setIsSaved] = useState(false)

  const handleSave = (newPrefs: Partial<Preferences>) => {
    updatePreferences(newPrefs)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  return (
    <div className='space-y-6 animate-fade-in max-w-4xl'>
      <div>
        <p className='text-muted-foreground text-sm'>
          Configure model parameters, chunking preferences, and local LLM settings.
        </p>
      </div>

      <div className='grid gap-6'>
        {/* RAG Pipeline Config */}
        <Card className='bg-card/25 border-border/40 backdrop-blur-md shadow-lg rounded-xl overflow-hidden'>
          <CardHeader className='py-4 border-b border-border/30 bg-card/5'>
            <CardTitle className='text-sm font-semibold flex items-center gap-2'>
              <Cpu className='h-4 w-4 text-primary' />
              Retrieval &amp; Chunking Configuration
            </CardTitle>
            <CardDescription className='text-xs'>Adjust chunk segmentation boundaries and hybrid rank parameters.</CardDescription>
          </CardHeader>
          <CardContent className='p-6 space-y-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <label className='text-xs font-semibold text-muted-foreground'>Chunk Size (Characters)</label>
                <Input
                  type='number'
                  value={prefs.chunkSize}
                  onChange={(e) => handleSave({ chunkSize: parseInt(e.target.value) || 500 })}
                  className='bg-background/50 border-border/45'
                />
                <p className='text-[10px] text-muted-foreground'>Maximum length of text segments.</p>
              </div>

              <div className='space-y-2'>
                <label className='text-xs font-semibold text-muted-foreground'>Chunk Overlap (Characters)</label>
                <Input
                  type='number'
                  value={prefs.chunkOverlap}
                  onChange={(e) => handleSave({ chunkOverlap: parseInt(e.target.value) || 100 })}
                  className='bg-background/50 border-border/45'
                />
                <p className='text-[10px] text-muted-foreground'>Buffer overlap size to preserve context between chunks.</p>
              </div>

              <div className='space-y-2'>
                <label className='text-xs font-semibold text-muted-foreground'>Retrieval Limit (Top-K)</label>
                <Input
                  type='number'
                  value={prefs.retrievalTopK}
                  onChange={(e) => handleSave({ retrievalTopK: parseInt(e.target.value) || 5 })}
                  className='bg-background/50 border-border/45'
                />
                <p className='text-[10px] text-muted-foreground'>Number of chunks fed to the LLM context.</p>
              </div>

              <div className='flex items-center justify-between p-4 bg-secondary/20 rounded-lg border border-border/35'>
                <div className='space-y-0.5'>
                  <label className='text-xs font-semibold text-foreground'>Hybrid Retrieval (RRF)</label>
                  <p className='text-[10px] text-muted-foreground'>Fuse semantic vector search with keyword exact matches.</p>
                </div>
                <button
                  type='button'
                  onClick={() => handleSave({ hybridRetrievalEnabled: !prefs.hybridRetrievalEnabled })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    prefs.hybridRetrievalEnabled ? 'bg-primary' : 'bg-secondary'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                      prefs.hybridRetrievalEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* LLM settings */}
        <Card className='bg-card/25 border-border/40 backdrop-blur-md shadow-lg rounded-xl overflow-hidden'>
          <CardHeader className='py-4 border-b border-border/30 bg-card/5'>
            <CardTitle className='text-sm font-semibold flex items-center gap-2'>
              <Cpu className='h-4 w-4 text-primary' />
              Local LLM Settings
            </CardTitle>
            <CardDescription className='text-xs'>Choose active local generation model and backend engine.</CardDescription>
          </CardHeader>
          <CardContent className='p-6 space-y-4'>
            <div className='grid gap-3 max-h-[350px] overflow-y-auto pr-1'>
              {LLM_OPTIONS.map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => handleSave({ llmVariantId: opt.id, llmModelId: opt.logicalModelId })}
                  className={`p-4 rounded-lg border bg-card/10 cursor-pointer transition-all duration-200 ${
                    prefs.llmVariantId === opt.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/45'
                      : 'border-border/30 hover:border-border/50 hover:bg-card/20'
                  }`}
                >
                  <div className='flex justify-between items-start'>
                    <div className='space-y-1'>
                      <div className='flex items-center gap-2'>
                        <h4 className='font-semibold text-xs text-foreground'>{opt.name}</h4>
                        <span className='text-[9px] bg-secondary/80 text-muted-foreground border border-border/30 px-1.5 py-0.2 rounded font-mono uppercase'>
                          {opt.engineType}
                        </span>
                      </div>
                      <p className='text-[10px] text-muted-foreground leading-relaxed'>
                        Size: {opt.sizeLabel} • Limit: {opt.tokenLimits.text} tokens
                      </p>
                      {opt.requirements.length > 0 && (
                        <div className='flex gap-1.5 mt-1'>
                          {opt.requirements.map((req) => (
                            <span
                              key={req}
                              className='text-[8px] border border-orange-500/25 bg-orange-500/5 text-orange-500/90 px-1.5 py-0.2 rounded font-semibold uppercase'
                            >
                              {req}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {prefs.llmVariantId === opt.id && (
                      <span className='text-[10px] bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded font-semibold'>
                        Active
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='flex justify-end pt-2'>
        <Button
          onClick={() => handleSave({})}
          className='shadow-md flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground select-none'
        >
          {isSaved ? (
            <>
              <CheckCircle2 className='h-4 w-4' />
              Settings Saved!
            </>
          ) : (
            <>
              <Save className='h-4 w-4' />
              Save Configuration
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
