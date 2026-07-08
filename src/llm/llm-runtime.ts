import {
  type LLMVariant,
  type LLMEngineType,
  getLLMModel,
} from './llm-models'
import {
  variantSupportsTools,
  variantUsesPromptToolFallback,
} from './engine-features'
import type { AiSdkStreamRequest, RuntimeMessage } from './ai-sdk-stream'
import { createParser } from './parsers/factory'
import { ToolCallStreamParser, formatToolResultForPrompt, formatToolCallForPrompt } from './parsers/tools'
import type { LLMStreamEvent } from './parsers'

export type { LLMStreamEvent, RuntimeMessage }

type RuntimeStreamOptions = {
  maxTokens?: number
  thinkingEnabled?: boolean
  toolsEnabled?: boolean
}

type LLMToolCall = any
type LLMToolResult = any
const MAX_TOOL_CALLS_PER_ROUND = 0
const MAX_TOOL_ROUNDS = 0
const buildToolPromptPrefix = (): string => ''
const buildToolPromptSection = (): string => ''
const executeToolCalls = async (_calls: any, _opts?: any): Promise<any[]> => []

export type LLMBackendHandle = {
  isReady: boolean
  loadProgress: number
  loadModel: (modelId: string) => Promise<boolean>
  unload: () => Promise<void>
  abort: () => void
  chatStream?: (
    messages: RuntimeMessage[],
    systemPrompt?: string,
    imageOrOptions?: string | RuntimeStreamOptions,
    options?: RuntimeStreamOptions,
  ) => AsyncGenerator<string, void, unknown>
  chatStreamEvents?: (
    request: AiSdkStreamRequest,
  ) => AsyncGenerator<LLMStreamEvent, void, unknown>
}

export type LLMRuntimeHandles = {
  gemma4: LLMBackendHandle
  webllm: LLMBackendHandle
  lfm2: LLMBackendHandle
  qwen35: LLMBackendHandle
}

export interface LLMRequest {
  messages: RuntimeMessage[]
  systemPrompt?: string
  imageDataUrl?: string
  options?: RuntimeStreamOptions
}

export interface LLMEngineAdapter {
  engine: LLMEngineType
  load(variant: LLMVariant, handles: LLMRuntimeHandles): Promise<boolean>
  unload(handles: LLMRuntimeHandles, variant?: LLMVariant): Promise<void>
  isReady(variant: LLMVariant, handles: LLMRuntimeHandles): boolean
  abort(handles: LLMRuntimeHandles): void
  stream(
    request: LLMRequest,
    variant: LLMVariant,
    handles: LLMRuntimeHandles,
  ): AsyncGenerator<LLMStreamEvent, void, unknown>
  getLoadProgress(handles: LLMRuntimeHandles): number
}

export async function* parseRawStream(
  rawStream: AsyncGenerator<string, void, unknown>,
  family: string,
  thinkingEnabled: boolean,
  toolsEnabled = false,
): AsyncGenerator<LLMStreamEvent, void, unknown> {
  const parser = createParser(family, thinkingEnabled)
  const toolParser = toolsEnabled ? new ToolCallStreamParser() : null

  for await (const chunk of rawStream) {
    if (toolParser) {
      const { text, toolCalls } = toolParser.process(chunk)
      for (const call of toolCalls) {
        yield { type: 'tool_call', call }
      }
      if (!text) continue
      const { textDelta, thinkingDelta } = parser.process(text)
      if (textDelta) yield { type: 'text_delta', text: textDelta }
      if (thinkingDelta) yield { type: 'thinking_delta', text: thinkingDelta }
      continue
    }

    const { textDelta, thinkingDelta } = parser.process(chunk)
    if (textDelta) yield { type: 'text_delta', text: textDelta }
    if (thinkingDelta) yield { type: 'thinking_delta', text: thinkingDelta }
  }

  if (toolParser) {
    const { text, toolCalls } = toolParser.flush()
    for (const call of toolCalls) {
      yield { type: 'tool_call', call }
    }
    if (text) {
      const { textDelta, thinkingDelta } = parser.process(text)
      if (textDelta) yield { type: 'text_delta', text: textDelta }
      if (thinkingDelta) yield { type: 'thinking_delta', text: thinkingDelta }
    }
  }

  yield { type: 'done' }
}

function buildAiSdkRequest(
  req: LLMRequest,
  variant: LLMVariant,
): AiSdkStreamRequest {
  const thinkingEnabled =
    variant.capabilities.thinking && (req.options?.thinkingEnabled ?? false)
  const toolsEnabled =
    req.options?.toolsEnabled &&
    variantSupportsTools(variant) &&
    getLLMModel(variant.modelId).family !== 'lfm'

  return {
    messages: req.messages,
    systemPrompt: augmentSystemPromptForTools(req.systemPrompt, variant, toolsEnabled),
    imageDataUrl: req.imageDataUrl,
    maxTokens: req.options?.maxTokens,
    thinkingEnabled,
    toolsEnabled,
    modelFamily: getLLMModel(variant.modelId).family,
  }
}

function augmentSystemPromptForTools(
  systemPrompt: string | undefined,
  variant: LLMVariant,
  toolsEnabled?: boolean,
): string | undefined {
  if (!toolsEnabled || !variantUsesPromptToolFallback(variant)) {
    return systemPrompt
  }
  const prefix = buildToolPromptPrefix()
  const toolSection = buildToolPromptSection()
  if (systemPrompt) {
    return `${prefix}\n\n${systemPrompt}\n\n${toolSection}`
  }
  return toolSection
}

async function* streamAiSdkEngine(
  req: LLMRequest,
  variant: LLMVariant,
  handle: LLMBackendHandle,
): AsyncGenerator<LLMStreamEvent, void, unknown> {
  if (!handle.chatStreamEvents) {
    throw new Error('AI SDK streaming is not available for this engine')
  }
  yield* handle.chatStreamEvents(buildAiSdkRequest(req, variant))
}

function appendToolTurn(
  messages: RuntimeMessage[],
  calls: LLMToolCall[],
  results: LLMToolResult[],
  variant: LLMVariant,
): RuntimeMessage[] {
  const next = [...messages]

  if (variantUsesPromptToolFallback(variant)) {
    for (const call of calls) {
      next.push({ role: 'assistant', content: formatToolCallForPrompt(call) })
    }
    const resultText = results.map((result) => formatToolResultForPrompt(result)).join('\n')
    next.push({
      role: 'user',
      content: `${resultText}\n\nUse the tool result above to answer the user. Do not call the tool again or say you lack real-time access.`,
    })
    return next
  }

  next.push({
    role: 'assistant',
    content: '',
    toolCalls: calls,
  })

  for (const result of results) {
    next.push({
      role: 'tool',
      content: result.error ? `Error: ${result.error}` : result.content,
      toolCallId: result.callId,
      toolName: result.name,
    })
  }

  return next
}

const gemmaKernelEngine: LLMEngineAdapter = {
  engine: 'gemma4-kernel',
  load: async (variant, handles) => handles.gemma4.loadModel(variant.engineModelId),
  unload: async (handles) => handles.gemma4.unload(),
  isReady: (_variant, handles) => handles.gemma4.isReady,
  abort: (handles) => handles.gemma4.abort(),
  stream: (req, variant, handles) => {
    if (!handles.gemma4.chatStream) {
      throw new Error('Gemma kernel streaming is not available')
    }
    const thinkingEnabled =
      variant.capabilities.thinking && (req.options?.thinkingEnabled ?? false)
    const toolsEnabled = Boolean(req.options?.toolsEnabled && variantSupportsTools(variant))
    const systemPrompt = augmentSystemPromptForTools(req.systemPrompt, variant, toolsEnabled)
    return parseRawStream(
      handles.gemma4.chatStream(req.messages, systemPrompt, undefined, req.options),
      getLLMModel(variant.modelId).family,
      thinkingEnabled,
      toolsEnabled,
    )
  },
  getLoadProgress: (handles) => handles.gemma4.loadProgress,
}

const lfmKernelEngine: LLMEngineAdapter = {
  engine: 'lfm2-kernel',
  load: async (variant, handles) => handles.lfm2.loadModel(variant.engineModelId),
  unload: async (handles) => handles.lfm2.unload(),
  isReady: (_variant, handles) => handles.lfm2.isReady,
  abort: (handles) => handles.lfm2.abort(),
  stream: (req, variant, handles) => {
    if (!handles.lfm2.chatStream) {
      throw new Error('LFM kernel streaming is not available')
    }
    const toolsEnabled = Boolean(req.options?.toolsEnabled && variantSupportsTools(variant))
    const systemPrompt = augmentSystemPromptForTools(req.systemPrompt, variant, toolsEnabled)
    return parseRawStream(
      handles.lfm2.chatStream(req.messages, systemPrompt, req.options),
      getLLMModel(variant.modelId).family,
      false,
      toolsEnabled,
    )
  },
  getLoadProgress: (handles) => handles.lfm2.loadProgress,
}

const webllmEngine: LLMEngineAdapter = {
  engine: 'webllm',
  load: async (variant, handles) => handles.webllm.loadModel(variant.engineModelId),
  unload: async (handles) => handles.webllm.unload(),
  isReady: (_variant, handles) => handles.webllm.isReady,
  abort: (handles) => handles.webllm.abort(),
  stream: (req, variant, handles) => streamAiSdkEngine(req, variant, handles.webllm),
  getLoadProgress: (handles) => handles.webllm.loadProgress,
}

const transformersEngine: LLMEngineAdapter = {
  engine: 'transformers-js',
  load: async (variant, handles) => handles.qwen35.loadModel(variant.engineModelId),
  unload: async (handles) => handles.qwen35.unload(),
  isReady: (_variant, handles) => handles.qwen35.isReady,
  abort: (handles) => handles.qwen35.abort(),
  stream: (req, variant, handles) => streamAiSdkEngine(req, variant, handles.qwen35),
  getLoadProgress: (handles) => handles.qwen35.loadProgress,
}

const LLM_ENGINES: Record<LLMEngineType, LLMEngineAdapter> = {
  'gemma4-kernel': gemmaKernelEngine,
  'lfm2-kernel': lfmKernelEngine,
  'transformers-js': transformersEngine,
  webllm: webllmEngine,
}

export function getEngineAdapter(engine: LLMEngineType): LLMEngineAdapter {
  const adapter = LLM_ENGINES[engine]
  if (!adapter) throw new Error(`Unsupported engine type: ${engine}`)
  return adapter
}

export function getLLMVariantLoadProgress(variant: LLMVariant, handles: LLMRuntimeHandles): number {
  return getEngineAdapter(variant.engine).getLoadProgress(handles)
}

export async function loadLLMVariant(variant: LLMVariant, handles: LLMRuntimeHandles): Promise<boolean> {
  return getEngineAdapter(variant.engine).load(variant, handles)
}

export async function unloadLLMVariant(variant: LLMVariant, handles: LLMRuntimeHandles): Promise<void> {
  await getEngineAdapter(variant.engine).unload(handles, variant)
}

export async function unloadStaleLLMVariant(
  previous: LLMVariant | undefined,
  next: LLMVariant | undefined,
  handles: LLMRuntimeHandles,
): Promise<void> {
  if (!previous || !next) return

  if (previous.engine !== next.engine || previous.engineModelId !== next.engineModelId) {
    await unloadLLMVariant(previous, handles)
  }
}

export function abortLLMVariant(variant: LLMVariant, handles: LLMRuntimeHandles): void {
  getEngineAdapter(variant.engine).abort(handles)
}

export function assertLLMVariantReady(variant: LLMVariant, handles: LLMRuntimeHandles): void {
  if (!getEngineAdapter(variant.engine).isReady(variant, handles)) {
    throw new Error(`${variant.id} is not loaded`)
  }
}

export function streamLLMVariant(
  variant: LLMVariant,
  handles: LLMRuntimeHandles,
  messages: RuntimeMessage[],
  systemPrompt: string,
  imageDataUrl: string | undefined,
  options: RuntimeStreamOptions,
): AsyncGenerator<LLMStreamEvent, void, unknown> {
  assertLLMVariantReady(variant, handles)
  return getEngineAdapter(variant.engine).stream(
    {
      messages,
      systemPrompt,
      imageDataUrl,
      options,
    },
    variant,
    handles,
  )
}

export async function* streamLLMWithToolLoop(
  variant: LLMVariant,
  handles: LLMRuntimeHandles,
  messages: RuntimeMessage[],
  systemPrompt: string,
  imageDataUrl: string | undefined,
  options: RuntimeStreamOptions,
  abortSignal?: AbortSignal,
): AsyncGenerator<LLMStreamEvent, void, unknown> {
  const toolsEnabled = Boolean(options.toolsEnabled && variantSupportsTools(variant))

  if (!toolsEnabled) {
    yield* streamLLMVariant(variant, handles, messages, systemPrompt, imageDataUrl, options)
    return
  }

  let conversation = [...messages]
  let round = 0
  let sawDone = false
  let toolNudgeAttempted = false

  while (round < MAX_TOOL_ROUNDS) {
    if (abortSignal?.aborted) {
      abortLLMVariant(variant, handles)
      return
    }

    const roundToolCalls: LLMToolCall[] = []
    let hadAnswerText = false
    // Post-tool rounds: Gemma often answers in the thought channel; disable thinking
    // so the answer lands in the main text stream instead of the Thinking UI.
    const roundOptions =
      round > 0 || toolNudgeAttempted
        ? { ...options, thinkingEnabled: false }
        : options

    for await (const event of streamLLMVariant(
      variant,
      handles,
      conversation,
      systemPrompt,
      imageDataUrl,
      roundOptions,
    )) {
      if (abortSignal?.aborted) {
        abortLLMVariant(variant, handles)
        return
      }

      if (event.type === 'tool_call') {
        if (roundToolCalls.length < MAX_TOOL_CALLS_PER_ROUND) {
          roundToolCalls.push(event.call)
        }
        yield event
        continue
      }

      if (event.type === 'text_delta' && event.text.trim()) {
        hadAnswerText = true
      }

      if (event.type === 'done') {
        sawDone = true
        continue
      }

      yield event
    }

    if (roundToolCalls.length === 0) {
      const likelyNeedsTool = userMessageLikelyNeedsTool(getLastUserMessage(conversation))
      if (
        !toolNudgeAttempted &&
        variantUsesPromptToolFallback(variant) &&
        (!hadAnswerText || likelyNeedsTool)
      ) {
        toolNudgeAttempted = true
        conversation = [
          ...conversation,
          {
            role: 'user',
            content:
              'You must call the appropriate tool now. Output ONLY a ```tool_call fence with valid JSON. Do not explain, refuse, or say you lack real-time access.',
          },
        ]
        imageDataUrl = undefined
        sawDone = false
        continue
      }

      if (!sawDone) {
        yield { type: 'done' }
      }
      return
    }

    const results = await executeToolCalls(roundToolCalls, { abortSignal })
    for (const result of results) {
      yield { type: 'tool_result', result }
    }

    conversation = appendToolTurn(conversation, roundToolCalls, results, variant)
    round++
    sawDone = false
    imageDataUrl = undefined
    toolNudgeAttempted = false
  }

  if (!sawDone) {
    yield { type: 'done' }
  }
}

function getLastUserMessage(messages: RuntimeMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return ''
}

function userMessageLikelyNeedsTool(message: string): boolean {
  const msg = message.toLowerCase().trim()
  if (!msg) return false

  if (
    /\b(what('s| is)? (the )?(time|date|day)|current time|what time|time is it)\b/.test(msg) ||
    /\btime in\b/.test(msg) ||
    /\btoday('s)? date\b/.test(msg)
  ) {
    return true
  }

  if (
    /\b(calculate|compute|how much is|what is \d|\d\s*[\+\-\*\/%]|\bpercent\b)/.test(msg)
  ) {
    return true
  }

  return false
}
