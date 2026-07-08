import init, { LiteParse } from '@llamaindex/liteparse-wasm'

export interface ExtractedPage {
  pageNumber: number
  text: string
}

export interface TextExtractionResult {
  text: string
  pages?: ExtractedPage[]
  metadata?: Record<string, unknown>
}

let wasmInitialized = false

async function ensureWasmInitialized() {
  if (wasmInitialized) return
  await init()
  wasmInitialized = true
}

export async function extractTextFromPdf(
  pdfBytes: Uint8Array
): Promise<TextExtractionResult> {
  await ensureWasmInitialized()

  const parser = new LiteParse({
    ocrEnabled: false,
    outputFormat: 'json',
  })

  const result = await parser.parse(pdfBytes)
  
  let text = ''
  let pages: ExtractedPage[] = []

  if (typeof result === 'string') {
    text = result
  } else if (result && typeof result === 'object') {
    const rawResult = result as any
    text = rawResult.text || ''
    if (Array.isArray(rawResult.pages)) {
      pages = rawResult.pages.map((p: any) => ({
        pageNumber: p.page_number || p.pageNumber || 1,
        text: p.text || '',
      }))
    }
  }

  // Basic scanned PDF check: few characters extracted relative to byte size
  const isSparse = text.trim().length < 50 && pdfBytes.length > 50000

  return {
    text,
    pages,
    metadata: {
      ocrRequired: isSparse,
      pageCount: pages.length || 1,
    },
  }
}
