import { retrieveChunks, type RetrievalResult } from './retrieval'
import { loadPreferences } from '@/lib/preferences'
import { getLLMVariant } from '@/llm/llm-models'
import { streamLLMWithToolLoop } from '@/llm/llm-runtime'

export interface RAGAnswerChunk {
  type: 'text_delta' | 'thinking_delta' | 'citations' | 'done' | 'error'
  text?: string
  citations?: RetrievalResult[]
  error?: string
}

export async function* generateRAGAnswer(
  query: string,
  options: {
    documentId?: string
    collectionId?: string
    abortSignal?: AbortSignal
    llmHandles: any
  }
): AsyncGenerator<RAGAnswerChunk, void, unknown> {
  try {
    const prefs = loadPreferences()

    // 1. Retrieve relevant chunks
    const citations = await retrieveChunks(query, {
      documentId: options.documentId,
      collectionId: options.collectionId,
      topK: prefs.retrievalTopK,
      hybridEnabled: prefs.hybridRetrievalEnabled,
    })

    // Yield citations immediately so the UI shows references while LLM starts generating
    yield { type: 'citations', citations }

    if (citations.length === 0) {
      yield { type: 'text_delta', text: 'No relevant information found in the documents to answer this query.' }
      yield { type: 'done' }
      return
    }

    // 2. Build context block
    const contextText = citations
      .map(
        (c, idx) =>
          `[Source ${idx + 1}] (${c.documentName}${c.metadata.pageNumber ? `, Page ${c.metadata.pageNumber}` : ''}):\n${c.text}`
      )
      .join('\n\n')

    const systemPrompt = `You are a helpful assistant answering user queries based on the provided document excerpts.
Answer the query as accurately as possible using only the context provided.
For statements that rely on a source, cite the source number like [1] or [2] matching the source indexes from the context.
If the context doesn't contain enough information to answer, state that you don't know based on the context.

Context Excerpts:
${contextText}`

    const messages = [{ role: 'user' as const, content: query }]
    const variant = getLLMVariant(prefs.llmVariantId)

    // 3. Stream LLM answer
    const stream = streamLLMWithToolLoop(
      variant,
      options.llmHandles,
      messages,
      systemPrompt,
      undefined,
      {
        maxTokens: 1024,
        thinkingEnabled: true,
        toolsEnabled: false,
      },
      options.abortSignal
    )

    for await (const event of stream) {
      if (event.type === 'text_delta') {
        yield { type: 'text_delta', text: event.text }
      } else if (event.type === 'thinking_delta') {
        yield { type: 'thinking_delta', text: event.text }
      } else if (event.type === 'done') {
        yield { type: 'done' }
      }
    }
  } catch (err: any) {
    yield { type: 'error', error: err?.message || 'Answer generation failed' }
  }
}
