import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, ChevronDown, Plus, Check, Layers, X, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EMBEDDING_MODELS } from '@/rag/embedding-models'
import { listProjects, createProject, type Project } from '@/lib/projects'
import { useSystemInit } from '@/context/system-init-context'
import { isDbInitialized } from '@/db/client'
import { cn } from '@/lib/utils'

interface CreateFormProps {
  onCreated: (project: Project) => void
  onCancel: () => void
}

function CreateForm({ onCreated, onCancel }: CreateFormProps) {
  const [name, setName] = useState('')
  const [embeddingModelId, setEmbeddingModelId] = useState(EMBEDDING_MODELS[0].id)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsCreating(true)
    setError(null)
    try {
      const project = await createProject(name.trim(), '', embeddingModelId)
      onCreated(project)
    } catch (err: any) {
      setError(err.message || 'Failed to create project')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className='p-3 border-t border-border/60 space-y-3'>
      <p className='text-[10px] font-semibold text-muted-foreground uppercase tracking-wider'>
        New Project
      </p>
      {error && (
        <p className='text-[10px] text-destructive'>{error}</p>
      )}
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder='Project name...'
        className='h-7 text-xs'
        autoFocus
      />
      <div className='space-y-1'>
        <p className='text-[10px] text-muted-foreground flex items-center gap-1'>
          <Layers className='h-3 w-3 text-primary/60' />
          Embedding model (locked after creation)
        </p>
        <select
          value={embeddingModelId}
          onChange={(e) => setEmbeddingModelId(e.target.value)}
          className='w-full bg-card border border-border/70 rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring'
        >
          {EMBEDDING_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName} ({m.dimensions}d)
            </option>
          ))}
        </select>
      </div>
      <div className='flex gap-1.5'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={onCancel}
          className='flex-1 h-7 text-xs text-muted-foreground'
        >
          <X className='h-3 w-3 mr-1' />
          Cancel
        </Button>
        <Button
          type='submit'
          size='sm'
          disabled={!name.trim() || isCreating}
          className='flex-1 h-7 text-xs'
        >
          {isCreating ? (
            <Sparkles className='h-3 w-3 mr-1 animate-pulse' />
          ) : (
            <Plus className='h-3 w-3 mr-1' />
          )}
          {isCreating ? 'Creating...' : 'Create'}
        </Button>
      </div>
    </form>
  )
}

export function ProjectSwitcher() {
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const { activeProject, setActiveProject } = useSystemInit()
  const dbReady = isDbInitialized()

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', dbReady],
    queryFn: listProjects,
    enabled: dbReady,
  })

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowCreate(false)
      }
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const handleSelect = (project: Project) => {
    setActiveProject(project)
    setOpen(false)
    setShowCreate(false)
  }

  const handleCreated = (project: Project) => {
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    setActiveProject(project)
    setOpen(false)
    setShowCreate(false)
  }

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        onClick={() => { setOpen((o) => !o); setShowCreate(false) }}
        className={cn(
          'flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-medium transition-all duration-150',
          'bg-card border-border/70 text-foreground hover:border-primary/40 hover:bg-card',
          open && 'border-primary/40 ring-1 ring-ring/30'
        )}
      >
        <FolderOpen className='h-3.5 w-3.5 text-primary/80 shrink-0' />
        <span className='max-w-[90px] sm:max-w-[140px] truncate'>
          {activeProject?.name ?? 'Select project'}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn(
          'absolute left-0 top-full mt-1.5 z-[200]',
          'w-64 bg-popover border border-border/70 rounded-lg shadow-lg',
          'page-enter overflow-hidden'
        )}>
          <div className='max-h-56 overflow-y-auto py-1'>
            {projects.length === 0 ? (
              <p className='px-3 py-4 text-xs text-muted-foreground text-center'>
                No projects yet. Create one below.
              </p>
            ) : (
              projects.map((project) => {
                const isActive = activeProject?.id === project.id
                const model = EMBEDDING_MODELS.find(m => m.id === project.embeddingModelId)
                return (
                  <button
                    key={project.id}
                    type='button'
                    onClick={() => handleSelect(project)}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60',
                      isActive && 'bg-primary/6'
                    )}
                  >
                    <div className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 rounded flex items-center justify-center',
                      isActive ? 'text-copper' : 'text-transparent'
                    )}>
                      <Check className='h-3.5 w-3.5' />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className={cn('text-xs font-medium truncate', isActive ? 'text-primary' : 'text-foreground')}>
                        {project.name}
                      </p>
                      <p className='text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate'>
                        <Layers className='h-2.5 w-2.5 shrink-0' />
                        {model?.displayName ?? project.embeddingModelId}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {showCreate ? (
            <CreateForm
              onCreated={handleCreated}
              onCancel={() => setShowCreate(false)}
            />
          ) : (
            <div className='border-t border-border/60 p-1'>
              <button
                type='button'
                onClick={() => setShowCreate(true)}
                className='w-full flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-primary/6 rounded-md transition-colors font-medium'
              >
                <Plus className='h-3.5 w-3.5' />
                Create new project
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
