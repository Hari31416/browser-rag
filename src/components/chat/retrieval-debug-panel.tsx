import { useState, type ReactNode } from 'react'
import { Bug, ChevronDown, ChevronUp } from 'lucide-react'
import type { RagDebugInfo } from '@/rag/orchestrator'
import type { RetrievalDebugHit } from '@/rag/retrieval'
import { cn } from '@/lib/utils'

function HitList({ hits, emptyLabel, scoreLabel }: {
  hits: RetrievalDebugHit[]
  emptyLabel: string
  scoreLabel?: string
}) {
  if (hits.length === 0) {
    return <p className="px-2.5 py-2 text-muted-foreground/70">{emptyLabel}</p>
  }

  return (
    <div className="divide-y divide-border/35 max-h-44 overflow-y-auto">
      {hits.map((hit) => (
        <div key={`${hit.chunkId}-${hit.rank}`} className="px-2.5 py-1.5 space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-semibold text-copper/80">#{hit.rank}</span>
            <span className="font-medium text-foreground truncate max-w-[160px]">{hit.documentName}</span>
            <span className="text-muted-foreground/55 font-mono">chunk {hit.chunkIndex}</span>
            {hit.pageNumber != null && (
              <span className="text-muted-foreground/55">p.{hit.pageNumber}</span>
            )}
            <span className="text-muted-foreground/70 font-mono">
              {scoreLabel ?? 'score'} {hit.score.toFixed(4)}
            </span>
            {hit.source && (
              <span className="text-[9px] bg-primary/10 text-primary px-1 py-0.5 rounded-sm capitalize">
                {hit.source === 'vector' ? 'semantic' : hit.source}
              </span>
            )}
          </div>
          {(hit.vectorRank != null || hit.keywordRank != null) && (
            <div className="flex gap-2 text-muted-foreground/55 font-mono">
              {hit.vectorRank != null && <span>vec rank {hit.vectorRank}</span>}
              {hit.keywordRank != null && <span>kw rank {hit.keywordRank}</span>}
              {hit.vectorScore != null && <span>vec {Number(hit.vectorScore).toFixed(3)}</span>}
              {hit.keywordScore != null && <span>kw {Number(hit.keywordScore).toFixed(3)}</span>}
            </div>
          )}
          <p className="text-muted-foreground leading-relaxed line-clamp-2">{hit.text}</p>
        </div>
      ))}
    </div>
  )
}

function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-border/40 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="font-semibold text-muted-foreground/80 uppercase tracking-wider">
          {title}
          {count != null && (
            <span className="ml-1.5 font-mono font-normal normal-case tracking-normal text-muted-foreground/55">
              ({count})
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && children}
    </div>
  )
}

export function RetrievalDebugPanel({ debug }: { debug: RagDebugInfo }) {
  const [open, setOpen] = useState(false)
  const rewritten = debug.wasRewritten

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-fit text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1 transition-colors',
          open ? 'text-primary' : 'text-muted-foreground/60 hover:text-primary'
        )}
      >
        <Bug className="h-2.5 w-2.5" />
        Debug
        {open ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
      </button>

      {open && (
        <div className="mt-1 border border-border/55 rounded-md bg-muted/25 overflow-hidden text-[10px]">
          <Section title="Queries" defaultOpen>
            <div className="px-2.5 pb-2 space-y-1.5">
              <div className="flex gap-2 items-start">
                <span className="text-muted-foreground/70 shrink-0 w-20 font-medium">User query</span>
                <span className="text-foreground/90 font-mono leading-relaxed">{debug.userQuery}</span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-muted-foreground/70 shrink-0 w-20 font-medium">
                  {rewritten ? 'Rewritten' : 'Search'}
                </span>
                <span className="text-foreground/90 font-mono leading-relaxed">
                  {debug.retrievalQuery}
                  {rewritten && (
                    <span className="ml-1.5 text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1 py-0.5 rounded-sm normal-case tracking-normal font-sans">
                      rewritten
                    </span>
                  )}
                  {!rewritten && debug.historyTurnCount > 0 && (
                    <span className="ml-1.5 text-[9px] bg-secondary text-muted-foreground px-1 py-0.5 rounded-sm normal-case tracking-normal font-sans">
                      unchanged
                    </span>
                  )}
                </span>
              </div>
              <div className="flex gap-2 items-start text-muted-foreground/70">
                <span className="shrink-0 w-20 font-medium">History</span>
                <span className="font-mono">
                  {debug.historyTurnCount} prior turn{debug.historyTurnCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </Section>

          <Section title="Settings" defaultOpen>
            <div className="px-2.5 pb-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground/80 font-mono">
              <span>hybrid {debug.retrieval.hybridEnabled ? 'on' : 'off'}</span>
              <span>topK {debug.retrieval.topK}</span>
              <span>RRF k={debug.retrieval.rrfConstant}</span>
              <span>vec limit {debug.retrieval.vectorLimit}</span>
              <span>kw limit {debug.retrieval.keywordLimit}</span>
              <span>embed {debug.retrieval.embeddingModelId}</span>
              {debug.retrieval.documentFilterCount != null && (
                <span>docs filter {debug.retrieval.documentFilterCount}</span>
              )}
            </div>
          </Section>

          <Section title="Timing">
            <div className="px-2.5 pb-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground/80 font-mono">
              <span>embed {debug.retrieval.timingMs.embed}ms</span>
              <span>semantic {debug.retrieval.timingMs.vector}ms</span>
              <span>keyword {debug.retrieval.timingMs.keyword}ms</span>
              <span>fusion {debug.retrieval.timingMs.fusion}ms</span>
              <span>total {debug.retrieval.timingMs.total}ms</span>
            </div>
          </Section>

          <Section title="Semantic hits" count={debug.retrieval.semanticHits.length} defaultOpen>
            <HitList
              hits={debug.retrieval.semanticHits}
              emptyLabel="No semantic (vector) hits."
              scoreLabel="cosine"
            />
          </Section>

          <Section title="Keyword hits" count={debug.retrieval.keywordHits.length} defaultOpen>
            <HitList
              hits={debug.retrieval.keywordHits}
              emptyLabel={
                debug.retrieval.hybridEnabled
                  ? 'No keyword hits.'
                  : 'Keyword search skipped (hybrid off).'
              }
              scoreLabel="ts_rank"
            />
          </Section>

          <Section title="Final ranking (RRF)" count={debug.retrieval.fusedHits.length} defaultOpen>
            <HitList
              hits={debug.retrieval.fusedHits}
              emptyLabel="No fused results."
              scoreLabel="rrf"
            />
          </Section>
        </div>
      )}
    </div>
  )
}
