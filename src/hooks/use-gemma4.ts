import { useState, useRef, useCallback } from "react"
// @ts-ignore - Local JS file bundle
import { Gemma4Mobile } from "../lib/gemma-4-e2b.js"

export const GEMMA4_MODEL_ID = "google/gemma-4-E2B-it-qat-mobile-transformers"

export type Gemma4Status = "idle" | "loading" | "ready" | "generating" | "error"

interface UseGemma4Options {
  onStatusChange?: (status: Gemma4Status) => void
  onError?: (error: Error) => void
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ({ type: 'text'; text: string } | { type: 'image' })[]
}

type Gemma4Model = {
  generate: (
    messages: any[],
    options?: { maxNewTokens?: number; signal?: AbortSignal;[key: string]: any },
  ) => AsyncGenerator<{ token: number; delta: string; text: string }, void, unknown>
  complete: (
    messages: any[],
    options?: { maxNewTokens?: number; signal?: AbortSignal;[key: string]: any },
  ) => Promise<string>
  dispose?: () => void
}

/** Strip Gemma 4 thinking/channel markup from model output (matches chat_template.jinja). */
export function extractGemma4Response(text: string): string {
  let result = ""
  for (const part of text.split("<channel|>")) {
    if (part.includes("<|channel>")) {
      result += part.split("<|channel>")[0]
    } else {
      result += part
    }
  }

  return result
    .replace(/<\|turn>model\s*/g, "")
    .replace(/<\|turn>user\s*/g, "")
    .replace(/<turn\|>\s*/g, "")
    .replace(/<\|channel>thought\s*/g, "")
    .replace(/<\|think\|>\s*/g, "")
    .trim()
}

function formatGemma4Messages(
  messages: ChatMessage[],
  systemPrompt?: string,
) {
  const formattedMessages = messages.map((m) => {
    let contentStr = ""
    if (Array.isArray(m.content)) {
      const textPart = m.content.find((p) => p.type === 'text')
      if (textPart && 'text' in textPart) {
        contentStr = textPart.text
      }
    } else {
      contentStr = m.content
    }
    return {
      role: m.role === 'assistant' ? 'model' : m.role,
      content: contentStr,
    }
  })

  const chatMessages = systemPrompt
    ? [{ role: 'system' as const, content: systemPrompt }, ...formattedMessages]
    : formattedMessages

  return chatMessages
}

export function useGemma4(options: UseGemma4Options = {}) {
  const { onStatusChange, onError } = options

  const [status, setStatus] = useState<Gemma4Status>("idle")
  const [loadProgress, setLoadProgress] = useState(0)

  const modelRef = useRef<Gemma4Model | null>(null)
  const abortRef = useRef(false)
  const loadingRef = useRef(false)

  const updateStatus = useCallback(
    (newStatus: Gemma4Status) => {
      console.debug("[Gemma4] Status:", newStatus)
      setStatus(newStatus)
      onStatusChange?.(newStatus)
    },
    [onStatusChange],
  )

  const loadModel = useCallback(
    async (modelId: string = GEMMA4_MODEL_ID): Promise<boolean> => {
      if (loadingRef.current) return false

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

        const model = await Gemma4Mobile.load(modelId, {
          onProgress: progressCallback,
        })

        modelRef.current = model
        updateStatus("ready")
        console.log(`[Gemma4] Model ${modelId} loaded successfully`)
        return true
      } catch (error) {
        console.error("[Gemma4] Load error:", error)
        modelRef.current = null
        updateStatus("error")
        onError?.(error instanceof Error ? error : new Error(String(error)))
        return false
      } finally {
        loadingRef.current = false
      }
    },
    [updateStatus, onError],
  )

  const chat = useCallback(
    async (
      messages: ChatMessage[],
      systemPrompt?: string,
      _imageDataUrl?: string, // Kept for signature compatibility
      options?: { maxTokens?: number; enable_thinking?: boolean; thinking?: boolean },
    ): Promise<string> => {
      const model = modelRef.current

      if (!model) {
        throw new Error('Gemma 4 not loaded')
      }

      updateStatus('generating')
      abortRef.current = false

      try {
        const chatMessages = formatGemma4Messages(messages, systemPrompt)
        const maxNewTokens = options?.maxTokens ?? 128

        const responseText = await model.complete(chatMessages, {
          maxNewTokens,
          enable_thinking: options?.enable_thinking ?? true,
          thinking: options?.thinking ?? true,
        })

        const content = extractGemma4Response(responseText)

        updateStatus('ready')
        return content
      } catch (error) {
        if (abortRef.current) {
          updateStatus('ready')
          return ""
        }
        console.error('[Gemma4] Chat error:', error)
        updateStatus('error')
        throw error
      }
    },
    [updateStatus],
  )

  const chatStream = useCallback(
    async function* (
      messages: ChatMessage[],
      systemPrompt?: string,
      _imageDataUrl?: string, // Kept for signature compatibility
      options?: { maxTokens?: number; thinkingEnabled?: boolean },
    ): AsyncGenerator<string, void, unknown> {
      const model = modelRef.current

      if (!model) {
        throw new Error('Gemma 4 not loaded')
      }

      updateStatus('generating')
      abortRef.current = false

      try {
        const chatMessages = formatGemma4Messages(messages, systemPrompt)
        const maxNewTokens = options?.maxTokens ?? 128
        const thinkingEnabled = options?.thinkingEnabled ?? false

        const stream = model.generate(chatMessages, {
          maxNewTokens,
          enable_thinking: thinkingEnabled,
          thinking: thinkingEnabled,
        })

        for await (const chunk of stream) {
          if (abortRef.current) break
          if (chunk.delta) {
            console.log('[GEMMA RAW DELTA]', JSON.stringify(chunk.delta))
            yield chunk.delta
          }
        }

        updateStatus('ready')
      } catch (error) {
        if (abortRef.current) {
          updateStatus('ready')
          return
        }
        console.error('[Gemma4] Stream error:', error)
        updateStatus('error')
        throw error
      }
    },
    [updateStatus],
  )

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  const unload = useCallback(async () => {
    modelRef.current?.dispose?.()
    modelRef.current = null
    updateStatus("idle")
    setLoadProgress(0)
  }, [updateStatus])

  return {
    status,
    loadProgress,
    currentModel: status === "ready" ? GEMMA4_MODEL_ID : null,
    isReady: status === "ready",
    isLoading: status === "loading",
    isGenerating: status === "generating",
    loadModel,
    chat,
    chatStream,
    abort,
    unload,
  }
}
