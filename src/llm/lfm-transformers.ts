import type { TransformersJSLanguageModel } from '@browser-ai/transformers-js'
import type { LLMStreamEvent } from './parsers'
import type { AiSdkStreamRequest } from './ai-sdk-stream'

type TokenizerWithTemplate = {
  chat_template?: string
}

type TransformersModelInternals = {
  modelInstance?: [TokenizerWithTemplate, unknown]
}

/** LFM ONNX models loaded through @browser-ai/transformers-js. */
export function isLfmOnnxModel(modelId: string): boolean {
  return /lfm2\.?5/i.test(modelId)
}

/**
 * LFM chat templates use {% generation %} blocks that Transformers.js cannot parse.
 * The custom kernel strips these before template evaluation — mirror that here.
 */
export function stripLfmGenerationBlocks(template: string): string {
  return template.replace(
    /(\s*){%(-?)\s*(?:end)?generation\s*(-?)%}(\s*)/gs,
    (_match, leading: string, trimStart: string, trimEnd: string, trailing: string) =>
      `${trimStart ? '' : leading}${trimEnd ? '' : trailing}`,
  )
}

export function patchLfmTransformersChatTemplate(model: TransformersJSLanguageModel): void {
  const tokenizer = (model as unknown as TransformersModelInternals).modelInstance?.[0]
  if (!tokenizer?.chat_template) return
  tokenizer.chat_template = stripLfmGenerationBlocks(tokenizer.chat_template)
}

type V3PromptMessage = {
  role: 'system' | 'user' | 'assistant'
  content: Array<{ type: 'text'; text: string }>
}

function buildLfmPrompt(req: AiSdkStreamRequest): V3PromptMessage[] {
  const prompt: V3PromptMessage[] = []

  if (req.systemPrompt) {
    prompt.push({
      role: 'system',
      content: [{ type: 'text', text: req.systemPrompt }],
    })
  }

  for (const msg of req.messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      prompt.push({
        role: msg.role,
        content: [{ type: 'text', text: msg.content }],
      })
    }
  }

  return prompt
}

/** Stream LFM via model.doStream — bypasses AI SDK toolChoice and tool plumbing. */
export async function* streamLfmTransformersToEvents(
  model: TransformersJSLanguageModel,
  req: AiSdkStreamRequest,
  abortSignal?: AbortSignal,
): AsyncGenerator<LLMStreamEvent, void, unknown> {
  const { stream } = await model.doStream({
    prompt: buildLfmPrompt(req) as Parameters<TransformersJSLanguageModel['doStream']>[0]['prompt'],
    maxOutputTokens: req.maxTokens,
    abortSignal,
  })

  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      if (value.type === 'text-delta' && value.delta) {
        yield { type: 'text_delta', text: value.delta }
      }
    }
  } finally {
    reader.releaseLock()
  }

  yield { type: 'done' }
}
