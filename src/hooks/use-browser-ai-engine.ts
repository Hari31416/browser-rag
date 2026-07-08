import { useState, useRef, useCallback } from 'react'
import {
  streamAiSdkToEvents,
  type AiSdkProvider,
  type AiSdkStreamRequest,
} from '@/llm/ai-sdk-stream'
import type { LLMStreamEvent } from '@/llm/parsers'

export type BrowserAiEngineStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error'

interface UseBrowserAiEngineOptions<TModel> {
  engineLabel: string
  provider: AiSdkProvider
  createModel: (modelId: string, onProgress: (pct: number) => void) => TModel
  disposeModel: (model: TModel) => Promise<void>
  onModelCreated?: (model: TModel, modelId: string) => void
  onStatusChange?: (status: BrowserAiEngineStatus) => void
  onError?: (error: Error) => void
  onLoadMessage?: (message: string) => void
  getLoadMessage?: (modelId: string, progress: number) => string | undefined
  beforeSessionInit?: () => void
}

export function useBrowserAiEngine<TModel>({
  engineLabel,
  provider,
  createModel,
  disposeModel,
  onModelCreated,
  onStatusChange,
  onError,
  onLoadMessage,
  getLoadMessage,
  beforeSessionInit,
}: UseBrowserAiEngineOptions<TModel>) {
  const [status, setStatus] = useState<BrowserAiEngineStatus>('idle')
  const [loadProgress, setLoadProgress] = useState(0)
  const [currentModel, setCurrentModel] = useState<string | null>(null)

  const modelRef = useRef<TModel | null>(null)
  const currentModelRef = useRef<string | null>(null)
  const loadingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const updateStatus = useCallback(
    (newStatus: BrowserAiEngineStatus) => {
      console.debug(`[${engineLabel}] Status:`, newStatus)
      setStatus(newStatus)
      onStatusChange?.(newStatus)
    },
    [engineLabel, onStatusChange],
  )

  const reportProgress = useCallback(
    (modelId: string, pct: number) => {
      const capped = Math.min(99, pct)
      setLoadProgress(capped)
      const message = getLoadMessage?.(modelId, capped)
      if (message) onLoadMessage?.(message)
    },
    [getLoadMessage, onLoadMessage],
  )

  const loadModel = useCallback(
    async (modelId: string): Promise<boolean> => {
      if (loadingRef.current) return false
      if (modelRef.current && currentModelRef.current === modelId) {
        return true
      }

      loadingRef.current = true
      updateStatus('loading')
      setLoadProgress(0)

      const previous = modelRef.current
      if (previous) {
        await disposeModel(previous)
      }
      modelRef.current = null
      currentModelRef.current = null

      try {
        beforeSessionInit?.()
        onLoadMessage?.('Downloading model weights...')

        const model = createModel(modelId, (pct) => reportProgress(modelId, pct))

        await (model as { createSessionWithProgress: (cb: (p: number) => void) => Promise<void> })
          .createSessionWithProgress((progress) => {
            reportProgress(modelId, Math.round(progress * 100))
          })

        onModelCreated?.(model, modelId)

        modelRef.current = model
        currentModelRef.current = modelId
        setCurrentModel(modelId)
        setLoadProgress(100)
        updateStatus('ready')
        console.log(`[${engineLabel}] Model ${modelId} loaded successfully`)
        return true
      } catch (error) {
        console.error(`[${engineLabel}] Load error:`, error)
        modelRef.current = null
        currentModelRef.current = null
        setCurrentModel(null)
        updateStatus('error')
        onError?.(error instanceof Error ? error : new Error(String(error)))
        return false
      } finally {
        loadingRef.current = false
      }
    },
    [
      beforeSessionInit,
      createModel,
      disposeModel,
      engineLabel,
      onError,
      onLoadMessage,
      onModelCreated,
      reportProgress,
      updateStatus,
    ],
  )

  const chatStreamEvents = useCallback(
    async function* (request: AiSdkStreamRequest): AsyncGenerator<LLMStreamEvent, void, unknown> {
      const model = modelRef.current
      if (!model) {
        throw new Error(`${engineLabel} model not loaded`)
      }

      updateStatus('generating')
      abortRef.current = new AbortController()

      try {
        yield* streamAiSdkToEvents(
          model as never,
          provider,
          request,
          abortRef.current.signal,
        )
      } catch (error) {
        if (abortRef.current.signal.aborted) {
          updateStatus('ready')
          return
        }
        console.error(`[${engineLabel}] Stream error:`, error)
        updateStatus('error')
        throw error
      } finally {
        abortRef.current = null
        updateStatus('ready')
      }
    },
    [engineLabel, provider, updateStatus],
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const resetSession = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const unload = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = null
    const previous = modelRef.current
    if (previous) {
      await disposeModel(previous)
    }
    modelRef.current = null
    currentModelRef.current = null
    setCurrentModel(null)
    updateStatus('idle')
    setLoadProgress(0)
  }, [disposeModel, updateStatus])

  return {
    status,
    loadProgress,
    currentModel,
    isReady: status === 'ready',
    isLoading: status === 'loading',
    isGenerating: status === 'generating',
    loadModel,
    chatStreamEvents,
    abort,
    resetSession,
    unload,
  }
}
