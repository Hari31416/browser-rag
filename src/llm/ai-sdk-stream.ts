import {
  streamText,
  wrapLanguageModel,
  extractReasoningMiddleware,
  type LanguageModel,
  type ModelMessage,
} from 'ai'
import type { TransformersJSLanguageModel } from '@browser-ai/transformers-js'
import type { WebLLMLanguageModel } from '@browser-ai/web-llm'
import type { LLMStreamEvent } from './parsers'
import {
  ToolCallStreamParser,
  normalizeToolCallInput,
} from './parsers/tools'
import { unwrapGemmaThinkingAsAnswer } from './parsers/gemma'
import {
  isLfmOnnxModel,
  streamLfmTransformersToEvents,
} from './lfm-transformers'

type LLMToolCall = any
const createTools = (): any => undefined

export type AiSdkStreamRequest = {
  messages: RuntimeMessage[]
  systemPrompt?: string
  imageDataUrl?: string
  maxTokens?: number
  thinkingEnabled?: boolean
  toolsEnabled?: boolean
  modelFamily?: string
}

export type RuntimeMessage = {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: LLMToolCall[]
  toolCallId?: string
  toolName?: string
}

export type AiSdkProvider = 'transformers-js' | 'web-llm'

type BrowserAiModel = TransformersJSLanguageModel | WebLLMLanguageModel

const THINK_OPEN = '<' + 'think>'
const THINK_CLOSE = '</' + 'think>'

function buildMessages(req: AiSdkStreamRequest): ModelMessage[] {
  const messages: ModelMessage[] = []

  for (let i = 0; i < req.messages.length; i++) {
    const msg = req.messages[i]
    const isLastUserWithImage =
      msg.role === 'user' &&
      i === req.messages.length - 1 &&
      Boolean(req.imageDataUrl)

    if (msg.role === 'tool') {
      messages.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: msg.toolCallId ?? 'unknown',
            toolName: msg.toolName ?? 'unknown',
            output: { type: 'text', value: msg.content },
          },
        ],
      })
      continue
    }

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: msg.toolCalls.map((call) => ({
          type: 'tool-call' as const,
          toolCallId: call.id,
          toolName: call.name,
          input: call.arguments,
        })),
      })
      continue
    }

    if (isLastUserWithImage && req.imageDataUrl) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/jpeg',
            data: req.imageDataUrl,
          },
          { type: 'text', text: msg.content || ' ' },
        ],
      })
    } else if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content })
    } else {
      messages.push({ role: 'assistant', content: msg.content })
    }
  }

  return messages
}

function wrapModelWithReasoning(
  model: BrowserAiModel,
  thinkingEnabled: boolean,
): LanguageModel {
  const baseModel = model as unknown as LanguageModel
  if (!thinkingEnabled) return baseModel

  return wrapLanguageModel({
    model: baseModel as never,
    middleware: extractReasoningMiddleware({
      tagName: 'think',
      startWithReasoning: true,
    }),
  })
}

function sanitizeThinkingDelta(text: string): string {
  return text
    .replace(new RegExp(THINK_OPEN, 'g'), '')
    .replace(new RegExp(THINK_CLOSE, 'g'), '')
    .replace(/<\/?redacted_thinking>/gi, '')
    .replace(/<\/?thinking>/gi, '')
    .replace(/<\|think\|>\s*/g, '')
    .replace(/<\|channel>thought\s*/gi, '')
}

function sanitizeAnswerDelta(text: string, thinkingEnabled = true): string {
  if (!thinkingEnabled) {
    return unwrapGemmaThinkingAsAnswer(text)
  }
  return text
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(new RegExp(`${THINK_OPEN}[\\s\\S]*?${THINK_CLOSE}`, 'g'), '')
    .replace(/<\/?redacted_thinking>/gi, '')
    .replace(/<\/?thinking>/gi, '')
    .replace(new RegExp(THINK_OPEN, 'g'), '')
    .replace(new RegExp(THINK_CLOSE, 'g'), '')
    .trimStart()
}

function createBrowserAiStream(
  model: BrowserAiModel,
  provider: AiSdkProvider,
  req: AiSdkStreamRequest,
  abortSignal?: AbortSignal,
) {
  const thinkingEnabled = req.thinkingEnabled ?? false
  const toolsEnabled = req.toolsEnabled ?? false
  const languageModel = wrapModelWithReasoning(model, thinkingEnabled)

  const useProviderThinking =
    thinkingEnabled && !(toolsEnabled && provider === 'transformers-js')

  const providerOptions = useProviderThinking
    ? provider === 'transformers-js'
      ? { 'transformers-js': { enableThinking: true } }
      : { 'web-llm': { extra_body: { enable_thinking: true } } }
    : undefined

  return streamText({
    model: languageModel as never,
    messages: buildMessages(req),
    ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
    maxOutputTokens: req.maxTokens,
    abortSignal,
    providerOptions: providerOptions as never,
    ...(toolsEnabled ? { tools: createTools() } : {}),
  })
}

async function* mapFullStreamToEvents(
  result: any,
  options: {
    thinkingEnabled: boolean
    toolsEnabled: boolean
    provider: AiSdkProvider
  },
): AsyncGenerator<LLMStreamEvent, void, unknown> {
  const { thinkingEnabled, toolsEnabled, provider } = options
  const useTextToolParser = toolsEnabled && provider === 'transformers-js'
  const textToolParser = useTextToolParser ? new ToolCallStreamParser() : null

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta' && part.text) {
      if (textToolParser) {
        const { text, toolCalls } = textToolParser.process(part.text)
        for (const call of toolCalls) {
          yield { type: 'tool_call', call }
        }
        const cleaned = sanitizeAnswerDelta(text, thinkingEnabled)
        if (cleaned) {
          yield { type: 'text_delta', text: cleaned }
        }
      } else {
        const cleaned = sanitizeAnswerDelta(part.text, thinkingEnabled)
        if (cleaned) {
          yield { type: 'text_delta', text: cleaned }
        }
      }
    } else if (part.type === 'reasoning-delta' && part.text) {
      const cleaned = sanitizeThinkingDelta(part.text)
      if (cleaned) {
        yield { type: 'thinking_delta', text: cleaned }
      }
    } else if (part.type === 'tool-call' && !('invalid' in part && part.invalid)) {
      yield {
        type: 'tool_call',
        call: {
          id: part.toolCallId,
          name: part.toolName,
          arguments: normalizeToolCallInput(part.input),
        },
      }
    } else if (part.type === 'finish-step' && part.usage) {
      yield {
        type: 'usage',
        usage: {
          promptTokens: part.usage.inputTokens,
          completionTokens: part.usage.outputTokens,
          totalTokens: part.usage.totalTokens,
        },
      }
    } else if (part.type === 'finish') {
      if (textToolParser) {
        const { text, toolCalls } = textToolParser.flush()
        for (const call of toolCalls) {
          yield { type: 'tool_call', call }
        }
        if (text) {
          const cleaned = sanitizeAnswerDelta(text, thinkingEnabled)
          if (cleaned) {
            yield { type: 'text_delta', text: cleaned }
          }
        }
      }
      yield { type: 'done' }
    }
  }
}

export async function* streamAiSdkToEvents(
  model: BrowserAiModel,
  provider: AiSdkProvider,
  req: AiSdkStreamRequest,
  abortSignal?: AbortSignal,
): AsyncGenerator<LLMStreamEvent, void, unknown> {
  if (provider === 'transformers-js' && isLfmOnnxModel(model.modelId)) {
    yield* streamLfmTransformersToEvents(
      model as TransformersJSLanguageModel,
      req,
      abortSignal,
    )
    return
  }

  const thinkingEnabled = req.thinkingEnabled ?? false
  const toolsEnabled = req.toolsEnabled ?? false
  const result = createBrowserAiStream(model, provider, req, abortSignal)

  yield* mapFullStreamToEvents(result, {
    thinkingEnabled,
    toolsEnabled,
    provider,
  })
}
