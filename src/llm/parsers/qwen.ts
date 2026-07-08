import { BaseStreamParser } from './index'

const THINK_OPEN = '<' + 'think>'
const THINK_CLOSE = '</' + 'think>'

export class QwenStreamParser extends BaseStreamParser {
  protected override parse(cleanText: string) {
    const cleanTextVal = cleanText
      .replace(/<\|im_end\|>/g, '')
      .replace(/<\|im_start\|>/g, '')

    let thinkStart = cleanTextVal.indexOf('<think>')
    let tagLength = '<think>'.length
    let closeTag = '</think>'

    if (thinkStart === -1) {
      thinkStart = cleanTextVal.indexOf('<thinking>')
      tagLength = '<thinking>'.length
      closeTag = '</thinking>'
    }

    if (thinkStart === -1) {
      thinkStart = cleanTextVal.indexOf(THINK_OPEN)
      tagLength = THINK_OPEN.length
      closeTag = THINK_CLOSE
    }

    // Reasoning without an opening tag (Qwen 3.5 streams think-close only).
    if (thinkStart === -1) {
      const implicitClose = cleanTextVal.indexOf(THINK_CLOSE)
      if (implicitClose !== -1) {
        const thinking = cleanTextVal.slice(0, implicitClose)
        const text = cleanTextVal.slice(implicitClose + THINK_CLOSE.length)
        return {
          text: text.replace(/^[\s\n]+/, ''),
          thinking: thinking.replace(/^[\s\n]+/, ''),
        }
      }
    }

    if (thinkStart === -1) {
      return { text: cleanTextVal, thinking: '' }
    }

    const thinkEnd = cleanTextVal.indexOf(closeTag, thinkStart)
    if (thinkEnd === -1) {
      const thinking = cleanTextVal.slice(thinkStart + tagLength)
      const text = cleanTextVal.slice(0, thinkStart)
      return {
        text: text.replace(/^[\s\n]+/, ''),
        thinking: thinking.replace(/^[\s\n]+/, ''),
      }
    }

    const thinking = cleanTextVal.slice(thinkStart + tagLength, thinkEnd)
    const textBefore = cleanTextVal.slice(0, thinkStart)
    const textAfter = cleanTextVal.slice(thinkEnd + closeTag.length)

    const cleanTextOut = textBefore + textAfter.replace(/^[\s\n]+/, '')
    const cleanThinkingVal = thinking.replace(/^[\s\n]+/, '')

    return { text: cleanTextOut, thinking: cleanThinkingVal }
  }
}
