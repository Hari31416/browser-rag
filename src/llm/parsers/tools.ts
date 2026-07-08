const createToolCallId = (..._args: any[]): string => ''
const isRegisteredTool = (..._args: any[]): boolean => false
type LLMToolCall = any

const XML_TOOL_OPEN = '<tool_call>'
const XML_TOOL_CLOSE = '</tool_call>'
const FENCE_TOOL_OPEN = '```tool_call'
const FENCE_CLOSE = '```'

type ParsedToolCallPayload = {
  name?: string
  arguments?: unknown
  parameters?: unknown
}

function tryParseToolCallJson(raw: string): LLMToolCall | null {
  try {
    const payload = JSON.parse(raw.trim()) as ParsedToolCallPayload
    if (!payload.name || typeof payload.name !== 'string') {
      return null
    }
    if (!isRegisteredTool(payload.name)) {
      return null
    }
    return {
      id: createToolCallId(),
      name: payload.name,
      arguments: payload.arguments ?? payload.parameters ?? {},
    }
  } catch {
    return null
  }
}

export function normalizeToolCallInput(input: unknown): unknown {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input)
    } catch {
      return {}
    }
  }
  return input
}

export class ToolCallStreamParser {
  private buffer = ''

  process(chunk: string): { text: string; toolCalls: LLMToolCall[] } {
    this.buffer += chunk
    const toolCalls: LLMToolCall[] = []
    let text = ''

    while (this.buffer.length > 0) {
      const fenceIndex = this.buffer.indexOf(FENCE_TOOL_OPEN)
      const xmlIndex = this.buffer.indexOf(XML_TOOL_OPEN)

      const useFence =
        fenceIndex !== -1 && (xmlIndex === -1 || fenceIndex <= xmlIndex)
      const openIndex = useFence ? fenceIndex : xmlIndex
      const closeTag = useFence ? FENCE_CLOSE : XML_TOOL_CLOSE
      const payloadOffset = useFence
        ? FENCE_TOOL_OPEN.length
        : XML_TOOL_OPEN.length

      if (openIndex === -1) {
        const partialFence = findPartialSuffix(this.buffer, FENCE_TOOL_OPEN)
        const partialXml = findPartialSuffix(this.buffer, XML_TOOL_OPEN)
        const partial = Math.max(partialFence, partialXml)
        if (partial > 0) {
          text += this.buffer.slice(0, -partial)
          this.buffer = this.buffer.slice(-partial)
        } else {
          text += this.buffer
          this.buffer = ''
        }
        break
      }

      text += this.buffer.slice(0, openIndex)
      const afterOpen = this.buffer.slice(openIndex + payloadOffset)
      const closeIndex = afterOpen.indexOf(closeTag)

      if (closeIndex === -1) {
        this.buffer = this.buffer.slice(openIndex)
        break
      }

      const payload = useFence
        ? afterOpen.slice(0, closeIndex).trim()
        : afterOpen.slice(0, closeIndex)
      const call = tryParseToolCallJson(payload)
      if (call) {
        toolCalls.push(call)
      }

      this.buffer = afterOpen.slice(closeIndex + closeTag.length)
    }

    return { text, toolCalls }
  }

  flush(): { text: string; toolCalls: LLMToolCall[] } {
    const remaining = this.buffer
    this.buffer = ''
    return { text: remaining, toolCalls: [] }
  }
}

function findPartialSuffix(text: string, tag: string): number {
  const maxLen = Math.min(text.length, tag.length - 1)
  for (let len = maxLen; len > 0; len--) {
    const suffix = text.slice(-len)
    if (tag.startsWith(suffix) && suffix.length < tag.length) {
      return len
    }
  }
  return 0
}

export function formatToolCallForPrompt(call: {
  name: string
  arguments: unknown
}): string {
  return `\`\`\`tool_call
${JSON.stringify({ name: call.name, arguments: call.arguments })}
\`\`\``
}

export function formatToolResultForPrompt(result: {
  callId: string
  name: string
  content: string
  error?: string
}): string {
  return `\`\`\`tool_result
${JSON.stringify({
  id: result.callId,
  name: result.name,
  result: result.error ? { error: result.error } : result.content,
  error: Boolean(result.error),
})}
\`\`\``
}
