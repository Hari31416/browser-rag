import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadPreferences, savePreferences, type Preferences } from '@/lib/preferences'
import { useGemma4 } from '@/hooks/use-gemma4'
import { useWebLLM } from '@/hooks/use-webllm'
import { useLfm2 } from '@/hooks/use-lfm2'
import { useQwen35 } from '@/hooks/use-qwen35'
import { getLLMVariant } from '@/llm/llm-models'
import { getEmbeddingModelConfig } from '@/rag/embedding-models'
import { getEmbeddingProvider, localProvider } from '@/rag/embedding-runtime'

interface SystemInitContextType {
  preferences: Preferences
  updatePreferences: (newPrefs: Partial<Preferences>) => void
  
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

  // 2. Initialize LLM Engine Hooks (one global instantiation)
  const gemma4 = useGemma4()
  const webllm = useWebLLM()
  const lfm2 = useLfm2()
  const qwen35 = useQwen35()

  // 3. Embedding model state
  const [embeddingLoading, setEmbeddingLoading] = useState(false)
  const [embeddingProgress, setEmbeddingProgress] = useState(0)
  const [embeddingReady, setEmbeddingReady] = useState(false)
  const [loadingError, setLoadingError] = useState<string | null>(null)

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

  // Check if embedding model is loaded on mount or whenever selected embedding model ID changes
  useEffect(() => {
    const modelConfig = getEmbeddingModelConfig(preferences.embeddingModelId)
    const active = localProvider.getActiveModel()
    setEmbeddingReady(active !== null && active === modelConfig?.modelId)
  }, [preferences.embeddingModelId])

  // Preferences update wrapper
  const updatePreferences = useCallback((newPrefs: Partial<Preferences>) => {
    const updated = savePreferences(newPrefs)
    setPreferencesState(updated)
  }, [])

  // Load selected embedding model
  const loadEmbeddingModel = useCallback(async () => {
    setLoadingError(null)
    setEmbeddingLoading(true)
    setEmbeddingProgress(0)
    try {
      const modelConfig = getEmbeddingModelConfig(preferences.embeddingModelId)
      if (!modelConfig) {
        throw new Error(`Embedding model config not found for: ${preferences.embeddingModelId}`)
      }
      const provider = getEmbeddingProvider(preferences.embeddingProviderId)
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
  }, [preferences.embeddingModelId, preferences.embeddingProviderId])

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
