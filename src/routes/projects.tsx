import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FolderOpen,
  Plus,
  Trash2,
  CheckCircle2,
  Layers,
  Calendar,
  FileText,
  X,
  Sparkles,
} from 'lucide-react'
import { EMBEDDING_MODELS } from '@/rag/embedding-models'
import {
  listProjects,
  createProject,
  deleteProject,
  getProjectDocumentCount,
  type Project,
} from '@/lib/projects'
import { useSystemInit } from '@/context/system-init-context'
import { isDbInitialized } from '@/db/client'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/projects')({
  component: ProjectsComponent,
})

interface CreateDialogProps {
  onClose: () => void
  onCreated: (project: Project) => void
}

function CreateProjectDialog({ onClose, onCreated }: CreateDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [embeddingModelId, setEmbeddingModelId] = useState(EMBEDDING_MODELS[0].id)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsCreating(true)
    setError(null)
    try {
      const project = await createProject(name.trim(), description.trim(), embeddingModelId)
      onCreated(project)
    } catch (err: any) {
      setError(err.message || 'Failed to create project')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4'>
      <Card className='w-full max-w-md max-h-[90vh] overflow-y-auto bg-card border-border/70 relative rounded-lg page-enter'>
        <div className='absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent shrink-0' />
        <CardHeader className='pb-4 pt-6'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <div className='p-2 bg-primary/10 rounded-md text-primary border border-primary/20'>
                <FolderOpen className='h-4 w-4' />
              </div>
              <CardTitle className='text-base font-heading font-semibold'>New Project</CardTitle>
            </div>
            <Button
              variant='ghost'
              size='icon'
              onClick={onClose}
              className='h-7 w-7 rounded-md text-muted-foreground hover:text-foreground'
            >
              <X className='h-4 w-4' />
            </Button>
          </div>
          <CardDescription className='text-xs mt-1'>
            Choose an embedding model carefully — it cannot be changed after creation.
          </CardDescription>
        </CardHeader>
        <CardContent className='pb-6'>
          <form onSubmit={handleSubmit} className='space-y-4'>
            {error && (
              <div className='p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs'>
                {error}
              </div>
            )}
            <div className='space-y-1.5'>
              <label className='text-xs font-semibold text-muted-foreground'>
                Project Name <span className='text-destructive'>*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. Research Papers, Legal Docs'
                className='text-sm'
                autoFocus
              />
            </div>
            <div className='space-y-1.5'>
              <label className='text-xs font-semibold text-muted-foreground'>
                Description <span className='text-muted-foreground/60'>(optional)</span>
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='Brief description of this workspace'
                className='text-sm'
              />
            </div>
            <div className='space-y-2'>
              <label className='text-xs font-semibold text-muted-foreground flex items-center gap-1.5'>
                <Layers className='h-3.5 w-3.5 text-primary/70' />
                Embedding Model <span className='text-destructive'>*</span>
              </label>
              <div className='grid gap-2'>
                {EMBEDDING_MODELS.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => setEmbeddingModelId(model.id)}
                    className={cn(
                      'p-3 rounded-md border cursor-pointer transition-all duration-200',
                      embeddingModelId === model.id
                        ? 'border-primary bg-primary/5 ring-1 ring-ring/40'
                        : 'border-border/60 bg-card hover:border-border hover:bg-accent/30'
                    )}
                  >
                    <div className='flex items-center justify-between'>
                      <div>
                        <p className='text-xs font-semibold text-foreground'>{model.displayName}</p>
                        <p className='text-[10px] text-muted-foreground mt-0.5'>
                          {model.modelId} · {model.dimensions} dimensions · {model.browserSupport}
                        </p>
                      </div>
                      {embeddingModelId === model.id && (
                        <CheckCircle2 className='h-4 w-4 text-copper shrink-0' />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className='text-[10px] text-copper flex items-start gap-1'>
                <span className='font-bold shrink-0'>⚠</span>
                This model is locked after creation. All documents in this project will be embedded with it.
              </p>
            </div>
            <div className='flex gap-2 pt-2'>
              <Button type='button' variant='outline' onClick={onClose} className='flex-1 text-xs'>
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={!name.trim() || isCreating}
                className='flex-1 text-xs'
              >
                {isCreating ? (
                  <span className='flex items-center gap-2'>
                    <Sparkles className='h-3.5 w-3.5 animate-pulse' />
                    Creating...
                  </span>
                ) : (
                  <span className='flex items-center gap-2'>
                    <Plus className='h-3.5 w-3.5' />
                    Create Project
                  </span>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function ProjectsComponent() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { activeProject, setActiveProject } = useSystemInit()
  const dbReady = isDbInitialized()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', dbReady],
    queryFn: listProjects,
    enabled: dbReady,
  })

  const { data: docCounts = {} } = useQuery({
    queryKey: ['project-doc-counts', projects.map((p) => p.id).join(',')],
    queryFn: async () => {
      const counts: Record<string, number> = {}
      await Promise.all(
        projects.map(async (p) => {
          counts[p.id] = await getProjectDocumentCount(p.id)
        })
      )
      return counts
    },
    enabled: projects.length > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteProject(id)
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      if (activeProject?.id === deletedId) {
        // Will auto-resolve via context effect if all projects deleted
      }
    },
  })

  const handleSelectProject = (project: Project) => {
    setActiveProject(project)
  }

  const handleDelete = async (project: Project) => {
    if (!confirm(`Delete project "${project.name}"? All its documents and chunks will be permanently removed.`)) {
      return
    }
    setDeletingId(project.id)
    try {
      await deleteMutation.mutateAsync(project.id)
    } finally {
      setDeletingId(null)
    }
  }

  const handleCreated = (project: Project) => {
    setShowCreateDialog(false)
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    setActiveProject(project)
  }

  const getModelLabel = (modelId: string) => {
    return EMBEDDING_MODELS.find((m) => m.id === modelId)?.displayName ?? modelId
  }

  return (
    <>
      {showCreateDialog && (
        <CreateProjectDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={handleCreated}
        />
      )}

      <div className='space-y-6 max-w-4xl mx-auto w-full'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <h1 className='font-heading text-2xl font-semibold tracking-tight'>Projects</h1>
            <p className='text-muted-foreground text-sm mt-1'>
              Each project is an isolated workspace with a locked embedding model.
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className='shrink-0 flex items-center gap-2'
          >
            <Plus className='h-4 w-4' />
            New Project
          </Button>
        </div>

        {isLoading ? (
          <div className='h-48 flex items-center justify-center text-muted-foreground text-sm'>
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <Card className='bg-card border-border/70 rounded-lg overflow-hidden'>
            <CardContent className='flex flex-col items-center justify-center py-16 gap-4 text-center page-enter'>
              <div className='p-4 bg-primary/10 rounded-md text-primary border border-primary/20'>
                <FolderOpen className='h-8 w-8' />
              </div>
              <div className='space-y-1'>
                <p className='font-heading font-semibold text-lg text-foreground'>No projects yet</p>
                <p className='text-xs text-muted-foreground max-w-xs'>
                  Create your first project to start indexing and querying documents.
                </p>
              </div>
              <Button
                onClick={() => setShowCreateDialog(true)}
                className='flex items-center gap-2 mt-2'
              >
                <Plus className='h-4 w-4' />
                Create First Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className='grid gap-3'>
            {projects.map((project) => {
              const isActive = activeProject?.id === project.id
              const docCount = docCounts[project.id] ?? 0
              const isDeleting = deletingId === project.id
              return (
                <Card
                  key={project.id}
                  className={cn(
                    'relative overflow-hidden rounded-lg transition-all duration-200 cursor-pointer group border-l-2',
                    isActive
                      ? 'border-border/70 border-l-primary bg-primary/4'
                      : 'border-border/70 border-l-transparent bg-card hover:border-primary/30'
                  )}
                  onClick={() => handleSelectProject(project)}
                >
                  <CardContent className='p-5'>
                    <div className='flex items-start justify-between gap-4'>
                      <div className='flex items-start gap-3 flex-1 min-w-0'>
                        <div
                          className={cn(
                            'p-2.5 rounded-md shrink-0 mt-0.5 transition-colors border',
                            isActive
                              ? 'bg-primary/10 text-primary border-primary/25'
                              : 'bg-secondary text-muted-foreground border-border/60 group-hover:text-foreground'
                          )}
                        >
                          <FolderOpen className='h-4 w-4' />
                        </div>
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center gap-2 flex-wrap'>
                            <h3 className='font-heading font-semibold text-base text-foreground truncate'>
                              {project.name}
                            </h3>
                            {isActive && (
                              <span className='inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/25 px-2 py-0.5 rounded-sm font-semibold shrink-0'>
                                <CheckCircle2 className='h-3 w-3' />
                                Active
                              </span>
                            )}
                          </div>
                          {project.description && (
                            <p className='text-xs text-muted-foreground mt-0.5 line-clamp-1'>
                              {project.description}
                            </p>
                          )}
                          <div className='flex flex-wrap items-center gap-3 mt-2'>
                            <span className='inline-flex items-center gap-1 text-[10px] font-semibold bg-secondary text-muted-foreground border border-border/50 px-2 py-0.5 rounded-sm'>
                              <Layers className='h-3 w-3 text-primary/70' />
                              {getModelLabel(project.embeddingModelId)}
                            </span>
                            <span className='inline-flex items-center gap-1 text-[10px] text-muted-foreground'>
                              <FileText className='h-3 w-3' />
                              {docCount} {docCount === 1 ? 'document' : 'documents'}
                            </span>
                            <span className='inline-flex items-center gap-1 text-[10px] text-muted-foreground'>
                              <Calendar className='h-3 w-3' />
                              {new Date(project.createdAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant='ghost'
                        size='icon'
                        disabled={isDeleting}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(project)
                        }}
                        className='h-8 w-8 shrink-0 hover:text-destructive text-muted-foreground hover:bg-destructive/10 rounded-md md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity'
                        title='Delete project'
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
