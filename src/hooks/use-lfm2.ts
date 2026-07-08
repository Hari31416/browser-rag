import { useState, useRef, useCallback } from "react"
// @ts-ignore - Local JS file bundle
import { Lfm2Mobile } from "../lib/lfm2_5.js"

export type Lfm2Status = "idle" | "loading" | "ready" | "generating" | "error"

interface UseLfm2Options {
  onStatusChange?: (status: Lfm2Status) => void
  onError?: (error: Error) => void
}

interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
}

export function useLfm2(options: UseLfm2Options = {}) {
  const { onStatusChange, onError } = options

  const [status, setStatus] = useState<Lfm2Status>("idle")
  const [loadProgress, setLoadProgress] = useState(0)
  const [currentModel, setCurrentModel] = useState<string | null>(null)

  const modelRef = useRef<any | null>(null)
  const abortRef = useRef(false)
  const loadingRef = useRef(false)

  const updateStatus = useCallback(
    (newStatus: Lfm2Status) => {
      console.debug("[LFM2] Status:", newStatus)
      setStatus(newStatus)
      onStatusChange?.(newStatus)
    },
    [onStatusChange],
  )

  const loadModel = useCallback(
    async (modelId: string): Promise<boolean> => {
      if (loadingRef.current) return false
      if (modelRef.current && currentModel === modelId) {
        updateStatus("ready")
        return true
      }

      loadingRef.current = true
      updateStatus("loading")
      setLoadProgress(0)

      try {
        const progressCallback = (event: {
          status: string
          kind?: string
          message?: string
          loaded?: number
          total?: number
          fraction?: number
          fromCache?: boolean
        }) => {
          if (event.fraction !== undefined && event.fraction !== null) {
            setLoadProgress(Math.round(event.fraction * 100))
          }
        }

        const model = await Lfm2Mobile.load(modelId, {
          onProgress: progressCallback,
        })

        modelRef.current = model
        setCurrentModel(modelId)
        updateStatus("ready")
        console.log(`[LFM2] Model ${modelId} loaded successfully`)
        return true
      } catch (error) {
        console.error("[LFM2] Load error:", error)
        modelRef.current = null
        setCurrentModel(null)
        updateStatus("error")
        onError?.(error instanceof Error ? error : new Error(String(error)))
        return false
      } finally {
        loadingRef.current = false
      }
    },
    [updateStatus, onError],
  )

  const chatStream = useCallback(
    async function* (
      messages: ChatMessage[],
      systemPrompt?: string,
      options?: { maxTokens?: number },
    ): AsyncGenerator<string, void, unknown> {
      const model = modelRef.current
      if (!model) {
        throw new Error("Liquid LFM 2.5 not loaded")
      }

      updateStatus("generating")
      abortRef.current = false

      try {
        const formattedMessages = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const chatMessages = systemPrompt
          ? [{ role: "system" as const, content: systemPrompt }, ...formattedMessages]
          : formattedMessages

        const maxNewTokens = options?.maxTokens ?? 1024

        // Generate yields { token, delta, text }
        const stream = model.generate(chatMessages, {
          maxNewTokens,
        })

        for await (const chunk of stream) {
          if (abortRef.current) break
          yield chunk.delta
        }

        updateStatus("ready")
      } catch (error) {
        if (abortRef.current) {
          updateStatus("ready")
          return
        }
        console.error("[LFM2] Stream error:", error)
        updateStatus("error")
        throw error
      }
    },
    [updateStatus],
  )

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  const unload = useCallback(async () => {
    if (modelRef.current) {
      // The Lfm2Mobile class has runtime inside, which has a destroy method
      // Let's call dispose or destroy if it exists
      if (typeof modelRef.current.dispose === "function") {
        modelRef.current.dispose()
      }
      modelRef.current = null
      setCurrentModel(null)
      updateStatus("idle")
      setLoadProgress(0)
    }
  }, [updateStatus])

  return {
    status,
    loadProgress,
    currentModel,
    isReady: status === "ready",
    isLoading: status === "loading",
    isGenerating: status === "generating",
    loadModel,
    chatStream,
    abort,
    unload,
  }
}
