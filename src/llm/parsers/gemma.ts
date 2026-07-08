import { BaseStreamParser } from './index'

const GEMMA_CONTROL_TAG_RE =
  /<\|?turn>model\s*|<\|?turn>user\s*|<turn\|>\s*|<\|channel>thought\s*|<\|channel>main\s*|<\|channel\|>thought\s*|<\|channel\|>main\s*|<channel\|>thought\s*|<channel\|>main\s*|<\|think\|>\s*/gi

/** Unwrap thinking blocks and strip channel markers, keeping all narrative text. */
export function unwrapGemmaThinkingAsAnswer(text: string): string {
  const thinkOpen = '<' + 'think>'
  const thinkClose = '</' + 'think>'
  return text
    .replace(/<think>([\s\S]*?)<\/redacted_thinking>/gi, '$1')
    .replace(/<thinking>([\s\S]*?)<\/thinking>/gi, '$1')
    .replace(new RegExp(`${thinkOpen}([\\s\\S]*?)${thinkClose}`, 'g'), '$1')
    .replace(GEMMA_CONTROL_TAG_RE, '')
    .replace(/^[\s\n]+/, '')
}

export class GemmaPlainTextParser extends BaseStreamParser {
  protected override parse(cleanText: string) {
    return {
      text: unwrapGemmaThinkingAsAnswer(cleanText),
      thinking: '',
    }
  }
}

export class GemmaStreamParser extends BaseStreamParser {
  protected override parse(cleanText: string) {
    const channelRegex = /<\|?channel\|?>(thought|main)?|<\|?think\|?>|<\/?think(ing)?>/gi

    let thinking = ''
    let text = ''

    let currentChannel: 'text' | 'thinking' = 'text'
    let lastIndex = 0

    let match: RegExpExecArray | null
    channelRegex.lastIndex = 0

    while ((match = channelRegex.exec(cleanText)) !== null) {
      const matchIndex = match.index
      const tag = match[0]

      const content = cleanText.substring(lastIndex, matchIndex)
      if (currentChannel === 'thinking') {
        thinking += content
      } else {
        text += content
      }

      const lowerTag = tag.toLowerCase()
      if (
        lowerTag.includes('thought') ||
        lowerTag.includes('thinking') ||
        lowerTag === '<think>' ||
        lowerTag === '<|think|>'
      ) {
        currentChannel = 'thinking'
      } else if (
        lowerTag.includes('main') ||
        lowerTag === '</think>' ||
        lowerTag === '</thinking>'
      ) {
        currentChannel = 'text'
      } else if (lowerTag.includes('channel')) {
        // stand-alone channel marker (like <|channel> or <|channel|>).
        // Default to ending the thinking block and switching back to main text
        currentChannel = 'text'
      }

      lastIndex = channelRegex.lastIndex
    }

    if (lastIndex < cleanText.length) {
      const content = cleanText.substring(lastIndex)
      if (currentChannel === 'thinking') {
        thinking += content
      } else {
        text += content
      }
    }

    const clean = (val: string) => {
      return val
        .replace(/<\|turn>model\s*/g, '')
        .replace(/<\|turn>user\s*/g, '')
        .replace(/<turn\|>\s*/g, '')
        .replace(/<\|channel>thought\s*/g, '')
        .replace(/<\|channel>main\s*/g, '')
        .replace(/<\|channel\|>thought\s*/g, '')
        .replace(/<\|channel\|>main\s*/g, '')
        .replace(/<\|think\|>\s*/g, '')
        .replace(/^[\s\n]+/, '')
    }

    return {
      thinking: clean(thinking),
      text: clean(text),
    }
  }
}
