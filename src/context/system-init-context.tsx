import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadPreferences, savePreferences, type Preferences } from '@/lib/preferences'
import { useGemma4 } from '@/hooks/use-gemma4'
import { useWebLLM } from '@/hooks/use-webllm'
import { useLfm2 } from '@/hooks/use-lfm2'
import { useQwen35 } from '@/hooks/use-qwen35'
import { getLLMVariant } from '@/llm/llm-models'
import { getEmbeddingModelConfig } from '@/rag/embedding-models'
import { getEmbeddingProvider, localProvider } from '@/rag/embedding-runtime'
import { type Project, getProject, listProjects, createProject } from '@/lib/projects'
import { isDbInitialized } from '@/db/client'

interface SystemInitContextType {
  preferences: Preferences
  updatePreferences: (newPrefs: Partial<Preferences>) => void

  // Project state
  activeProject: Project | null
  setActiveProject: (project: Project) => void

  // LLM handles
  gemma4: ReturnType<typeof useGemma4>
  webllm: ReturnType<typeof useWebLLM>
  lfm2: ReturnType<typeof useLfm2>
  qwen35: ReturnType<typeof useQwen35>

  // LLM load states
  isLlmReady: boolean
  llmLoading: boolean
  llmProgress: number
  loadLlmModel: () => Promise<void>

  // Embedding load states
  embeddingReady: boolean
  embeddingLoading: boolean
  embeddingProgress: number
  loadEmbeddingModel: () => Promise<void>

  loadingError: string | null
  setLoadingError: (err: string | null) => void
}

const SystemInitContext = createContext<SystemInitContextType | undefined>(undefined)

export function SystemInitProvider({ children }: { children: React.ReactNode }) {
  // 1. Preferences state
  const [preferences, setPreferencesState] = useState<Preferences>(() => loadPreferences())

  // 2. Active project state — loaded from DB after DB is ready
  const [activeProject, setActiveProjectState] = useState<Project | null>(null)
  const [dbReady, setDbReady] = useState(isDbInitialized())

  // 3. Initialize LLM Engine Hooks (one global instantiation)
  const gemma4 = useGemma4()
  const webllm = useWebLLM()
  const lfm2 = useLfm2()
  const qwen35 = useQwen35()

  // 4. Embedding model state
  const [embeddingLoading, setEmbeddingLoading] = useState(false)
  const [embeddingProgress, setEmbeddingProgress] = useState(0)
  const [embeddingReady, setEmbeddingReady] = useState(false)
  const [loadingError, setLoadingError] = useState<string | null>(null)

  // Poll until DB is ready
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

  // On DB ready: resolve active project from preferences, or seed a default one
  useEffect(() => {
    if (!dbReady) return

    async function resolveActiveProject() {
      try {
        const prefs = loadPreferences()
        let project: Project | null = null

        if (prefs.activeProjectId) {
          project = await getProject(prefs.activeProjectId)
        }

        if (!project) {
          // Check if any projects exist; if not create a default
          const all = await listProjects()
          if (all.length > 0) {
            project = all[0]
          } else {
            project = await createProject(
              'Default Project',
              'Auto-created default workspace',
              'supabase-gte-small'
            )
          }
          savePreferences({ activeProjectId: project.id })
          setPreferencesState(loadPreferences())
        }

        setActiveProjectState(project)
      } catch (err) {
        console.error('Failed to resolve active project:', err)
      }
    }

    resolveActiveProject()
  }, [dbReady])

  // Determine active LLM hook dynamically
  const variant = getLLMVariant(preferences.llmVariantId)

  let activeLlmHook: any
  if (variant.engine === 'transformers-js') activeLlmHook = qwen35
  else if (variant.engine === 'webllm') activeLlmHook = webllm
  else if (variant.engine === 'gemma4-kernel') activeLlmHook = gemma4
  else if (variant.engine === 'lfm2-kernel') activeLlmHook = lfm2

  const isLlmReady = activeLlmHook ? (activeLlmHook.isReady || activeLlmHook.isGenerating) : false
  const llmLoading = activeLlmHook ? activeLlmHook.isLoading : false
  const llmProgress = activeLlmHook ? activeLlmHook.loadProgress : 0

  // Check if embedding model is loaded whenever active project changes
  useEffect(() => {
    if (!activeProject) return
    const modelConfig = getEmbeddingModelConfig(activeProject.embeddingModelId)
    const active = localProvider.getActiveModel()
    setEmbeddingReady(active !== null && active === modelConfig?.modelId)
  }, [activeProject])

  // Preferences update wrapper
  const updatePreferences = useCallback((newPrefs: Partial<Preferences>) => {
    const updated = savePreferences(newPrefs)
    setPreferencesState(updated)
  }, [])

  // Set active project and persist to preferences
  const setActiveProject = useCallback((project: Project) => {
    setActiveProjectState(project)
    savePreferences({ activeProjectId: project.id })
    setPreferencesState(loadPreferences())
    // Reset embedding ready state so user must re-load if model changed
    const modelConfig = getEmbeddingModelConfig(project.embeddingModelId)
    const active = localProvider.getActiveModel()
    setEmbeddingReady(active !== null && active === modelConfig?.modelId)
  }, [])

  // Load selected embedding model (derived from active project)
  const loadEmbeddingModel = useCallback(async () => {
    if (!activeProject) throw new Error('No active project selected')
    setLoadingError(null)
    setEmbeddingLoading(true)
    setEmbeddingProgress(0)
    try {
      const modelConfig = getEmbeddingModelConfig(activeProject.embeddingModelId)
      if (!modelConfig) {
        throw new Error(`Embedding model config not found for: ${activeProject.embeddingModelId}`)
      }
      const provider = getEmbeddingProvider('local')
      await provider.load(modelConfig.modelId, (prog: any) => {
        if (prog.type === 'load') {
          setEmbeddingProgress(Math.round(prog.progress))
        }
      })
      setEmbeddingReady(true)
    } catch (err: any) {
      console.error('Failed to load embedding model:', err)
      setLoadingError(err.message || 'Failed to load embedding model.')
      setEmbeddingReady(false)
    } finally {
      setEmbeddingLoading(false)
    }
  }, [activeProject])

  // Load active LLM model
  const loadLlmModel = useCallback(async () => {
    setLoadingError(null)
    if (!activeLlmHook) {
      throw new Error(`No active LLM engine found for variant ID: ${preferences.llmVariantId}`)
    }
    const success = await activeLlmHook.loadModel(variant.engineModelId)
    if (!success) {
      throw new Error(`Failed to load LLM model: ${variant.engineModelId}`)
    }
  }, [activeLlmHook, variant.engineModelId])

  return (
    <SystemInitContext.Provider
      value={{
        preferences,
        updatePreferences,
        activeProject,
        setActiveProject,
        gemma4,
        webllm,
        lfm2,
        qwen35,
        isLlmReady,
        llmLoading,
        llmProgress,
        loadLlmModel,
        embeddingReady,
        embeddingLoading,
        embeddingProgress,
        loadEmbeddingModel,
        loadingError,
        setLoadingError,
      }}
    >
      {children}
    </SystemInitContext.Provider>
  )
}

export function useSystemInit() {
  const context = useContext(SystemInitContext)
  if (context === undefined) {
    throw new Error('useSystemInit must be used within a SystemInitProvider')
  }
  return context
}
