import { BaseStreamParser } from './index'

export class DefaultStreamParser extends BaseStreamParser {
  protected override parse(cleanText: string) {
    return { text: cleanText, thinking: '' }
  }
}
