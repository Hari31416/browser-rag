import type { StreamParser } from './index'
import { DefaultStreamParser } from './default'
import { QwenStreamParser } from './qwen'
import { GemmaPlainTextParser, GemmaStreamParser } from './gemma'

export function createParser(family: string, thinkingEnabled: boolean): StreamParser {
  if (family === 'gemma') {
    return thinkingEnabled ? new GemmaStreamParser() : new GemmaPlainTextParser()
  }
  if (thinkingEnabled) {
    if (family === 'qwen') {
      return new QwenStreamParser()
    }
  }
  return new DefaultStreamParser()
}
