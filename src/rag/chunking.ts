export interface Chunk {
  text: string
  chunkIndex: number
  tokenCount: number
  startOffset: number
  endOffset: number
  pageNumber: number | null
  headingPath: string | null
}

interface PageOffset {
  pageNumber: number
  startOffset: number
  endOffset: number
}

export function chunkText(
  text: string,
  _fileName: string,
  options: {
    chunkSize?: number // in tokens (est. 4 chars per token)
    chunkOverlap?: number // in tokens
    pages?: { pageNumber: number; text: string }[]
  } = {}
): Chunk[] {
  const chunkSize = options.chunkSize || 500
  const chunkOverlap = options.chunkOverlap || 100

  // 1 token ~= 4 characters
  const maxChars = chunkSize * 4
  const overlapChars = chunkOverlap * 4

  // Calculate page offsets if pages are provided
  const pageOffsets: PageOffset[] = []
  if (options.pages && options.pages.length > 0) {
    let currentOffset = 0
    for (const page of options.pages) {
      const pageLen = page.text.length
      pageOffsets.push({
        pageNumber: page.pageNumber,
        startOffset: currentOffset,
        endOffset: currentOffset + pageLen,
      })
      // Account for the newline separator we'll use to join pages
      currentOffset += pageLen + 1
    }
  }

  const chunks: Chunk[] = []
  let chunkIndex = 0

  // Track heading hierarchy
  let currentHeadingPath: string[] = []

  // Function to get page number for a given character offset
  const getPageNumberForOffset = (offset: number): number | null => {
    if (pageOffsets.length === 0) return null
    const match = pageOffsets.find(
      (p) => offset >= p.startOffset && offset <= p.endOffset
    )
    return match ? match.pageNumber : pageOffsets[0].pageNumber
  }

  // Pre-split text into paragraphs and track headings
  const lines = text.split('\n')
  let currentPos = 0
  
  interface TextBlock {
    text: string
    startOffset: number
    endOffset: number
    headingPath: string | null
  }
  
  const blocks: TextBlock[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()
    const lineLen = line.length + 1 // +1 for the newline character

    if (trimmedLine.startsWith('#')) {
      // Update heading path
      const match = trimmedLine.match(/^(#+)\s*(.*)$/)
      if (match) {
        const level = match[1].length
        const headingText = match[2].trim()
        
        // Truncate path to level - 1 and push new heading
        currentHeadingPath = currentHeadingPath.slice(0, level - 1)
        currentHeadingPath.push(headingText)
      }
    }

    if (trimmedLine.length > 0) {
      blocks.push({
        text: trimmedLine,
        startOffset: currentPos,
        endOffset: currentPos + trimmedLine.length,
        headingPath: currentHeadingPath.join(' > ') || null,
      })
    }

    currentPos += lineLen
  }

  // Now, merge blocks into chunks
  let currentChunkBlocks: TextBlock[] = []

  const createChunk = (blockGroup: TextBlock[]) => {
    if (blockGroup.length === 0) return
    
    const start = blockGroup[0].startOffset
    const end = blockGroup[blockGroup.length - 1].endOffset
    const chunkTextContent = text.substring(start, end)
    const tokenEst = Math.ceil(chunkTextContent.length / 4)

    // Determine heading path and page number
    const primaryHeadingPath = blockGroup[0].headingPath
    const pageNum = getPageNumberForOffset(start)

    chunks.push({
      text: chunkTextContent,
      chunkIndex: chunkIndex++,
      tokenCount: tokenEst,
      startOffset: start,
      endOffset: end,
      pageNumber: pageNum,
      headingPath: primaryHeadingPath,
    })
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    
    // If a block itself is larger than maxChars, split it into sentences
    if (block.text.length > maxChars) {
      // Create first chunk from accumulated blocks if any
      if (currentChunkBlocks.length > 0) {
        createChunk(currentChunkBlocks)
        currentChunkBlocks = []
      }

      // Split large block by sentence
      const sentences = block.text.match(/[^.!?]+[.!?]+(\s|$)/g) || [block.text]
      let sentencePos = block.startOffset

      let subChunkBlocks: TextBlock[] = []
      let subChunkLen = 0

      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim()
        if (trimmedSentence.length === 0) continue

        const sentStart = sentencePos
        const sentEnd = sentencePos + sentence.length

        if (subChunkLen + trimmedSentence.length > maxChars) {
          if (subChunkBlocks.length > 0) {
            createChunk(subChunkBlocks)
            // Roll over with overlap
            const overlapLimit = Math.max(0, subChunkBlocks.length - 2)
            subChunkBlocks = subChunkBlocks.slice(overlapLimit)
            subChunkLen = subChunkBlocks.reduce((acc, b) => acc + b.text.length, 0)
          }
        }

        subChunkBlocks.push({
          text: trimmedSentence,
          startOffset: sentStart,
          endOffset: sentEnd,
          headingPath: block.headingPath,
        })
        subChunkLen += trimmedSentence.length
        sentencePos += sentence.length
      }

      if (subChunkBlocks.length > 0) {
        createChunk(subChunkBlocks)
      }
      
      continue
    }

    const currentLen = currentChunkBlocks.reduce((acc, b) => acc + b.text.length + 1, 0)

    if (currentLen + block.text.length > maxChars) {
      createChunk(currentChunkBlocks)
      
      // Implement overlap: find blocks to slide back to
      let overlapLen = 0
      const overlapBlocks: TextBlock[] = []
      for (let j = currentChunkBlocks.length - 1; j >= 0; j--) {
        const b = currentChunkBlocks[j]
        if (overlapLen + b.text.length > overlapChars) break
        overlapBlocks.unshift(b)
        overlapLen += b.text.length + 1
      }
      currentChunkBlocks = overlapBlocks
    }

    currentChunkBlocks.push(block)
  }

  // Create final chunk
  if (currentChunkBlocks.length > 0) {
    createChunk(currentChunkBlocks)
  }

  return chunks
}
