type LLMToolCall = any
type LLMToolResult = any

export type LLMUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_call'; call: LLMToolCall }
  | { type: 'tool_result'; result: LLMToolResult }
  | { type: 'usage'; usage: LLMUsage }
  | { type: 'done' }

export interface ParserResult {
  textDelta: string
  thinkingDelta: string
}

export interface StreamParser {
  process(chunk: string): ParserResult
}

const THINK_OPEN = '<' + 'think>'
const THINK_CLOSE = '</' + 'think>'

const SPECIAL_TAGS = [
  '<thinking>',
  '</thinking>',
  THINK_OPEN,
  THINK_CLOSE,
  '<think>',
  '</think>',
  '<channel|>',
  '<|channel>',
  '<|channel|>',
  '<channel>',
  '<|turn>',
  '<turn|>',
  '<|think|>',
  '<|im_end|>',
  '<|im_start|>',
]

/**
 * Splits a text into clean and pending prefix components.
 * If the end of the text matches a prefix of a special tag,
 * it buffers it until more tokens arrive, ensuring tags are not
 * accidentally emitted as text.
 */
export function splitPendingPrefix(text: string): { clean: string; pending: string } {
  const maxLen = Math.max(...SPECIAL_TAGS.map((t) => t.length))
  for (let len = Math.min(text.length, maxLen - 1); len > 0; len--) {
    const suffix = text.slice(-len)
    const matchesPrefix = SPECIAL_TAGS.some(
      (tag) => tag.startsWith(suffix) && suffix.length < tag.length,
    )
    if (matchesPrefix) {
      return {
        clean: text.slice(0, -len),
        pending: suffix,
      }
    }
  }
  return { clean: text, pending: '' }
}

export abstract class BaseStreamParser implements StreamParser {
  protected accumulated = ''
  protected lastText = ''
  protected lastThinking = ''

  protected abstract parse(cleanText: string): { text: string; thinking: string }

  process(chunk: string): ParserResult {
    this.accumulated += chunk
    const { clean } = splitPendingPrefix(this.accumulated)
    const parsed = this.parse(clean)

    const textDelta = parsed.text.slice(this.lastText.length)
    const thinkingDelta = parsed.thinking.slice(this.lastThinking.length)

    this.lastText = parsed.text
    this.lastThinking = parsed.thinking

    return { textDelta, thinkingDelta }
  }
}
