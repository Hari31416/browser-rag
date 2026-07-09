import { retrieveChunks, type RetrievalResult, type RetrievalDebugInfo } from './retrieval'
import { loadPreferences } from '@/lib/preferences'
import { getLLMVariant } from '@/llm/llm-models'
import { streamLLMWithToolLoop, type RuntimeMessage } from '@/llm/llm-runtime'

export interface RagDebugInfo {
  userQuery: string
  retrievalQuery: string
  wasRewritten: boolean
  historyTurnCount: number
  retrieval: RetrievalDebugInfo
}

export interface RAGAnswerChunk {
  type: 'text_delta' | 'thinking_delta' | 'citations' | 'retrieval_query' | 'debug' | 'done' | 'error'
  text?: string
  citations?: RetrievalResult[]
  /** Standalone search query used for retrieval (may differ from the user turn). */
  retrievalQuery?: string
  debug?: RagDebugInfo
  error?: string
}

/** Keep recent turns so local models stay within context limits. */
const MAX_HISTORY_TURNS = 8

function normalizePriorTurns(history: RuntimeMessage[] | undefined): RuntimeMessage[] {
  return (history ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)
}

function formatHistoryForRewrite(prior: RuntimeMessage[]): string {
  return prior
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')
}

/**
 * Rewrite a follow-up into a standalone search query using prior turns.
 * Falls back to the original query if rewriting fails or history is empty.
 */
async function rewriteQueryForRetrieval(
  query: string,
  prior: RuntimeMessage[],
  variant: ReturnType<typeof getLLMVariant>,
  llmHandles: any,
  abortSignal?: AbortSignal
): Promise<string> {
  if (prior.length === 0) return query

  const rewritePrompt = `Given the conversation history and the latest user message, write a single standalone search query that captures what the user is asking for now.
Resolve pronouns and references (e.g. "it", "that", "the second one") using the history.
Output ONLY the search query text — no quotes, labels, or explanation.
If the latest message is already a complete standalone question, return it unchanged.`

  const rewriteUser = `Conversation history:
${formatHistoryForRewrite(prior)}

Latest user message:
${query}

Standalone search query:`

  try {
    let rewritten = ''
    const stream = streamLLMWithToolLoop(
      variant,
      llmHandles,
      [{ role: 'user', content: rewriteUser }],
      rewritePrompt,
      undefined,
      {
        maxTokens: 128,
        thinkingEnabled: false,
        toolsEnabled: false,
      },
      abortSignal
    )

    for await (const event of stream) {
      if (abortSignal?.aborted) return query
      if (event.type === 'text_delta' && event.text) {
        rewritten += event.text
      }
    }

    const cleaned = rewritten
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(standalone search query|search query|query)\s*:\s*/i, '')
      .trim()

    return cleaned.length > 0 ? cleaned : query
  } catch {
    return query
  }
}

export async function* generateRAGAnswer(
  query: string,
  options: {
    projectId: string
    embeddingModelId: string
    documentId?: string
    documentIds?: string[]
    /** Prior user/assistant turns (excluding the current query). */
    conversationHistory?: RuntimeMessage[]
    abortSignal?: AbortSignal
    llmHandles: any
  }
): AsyncGenerator<RAGAnswerChunk, void, unknown> {
  try {
    const prefs = loadPreferences()
    const variant = getLLMVariant(prefs.llmVariantId)
    const prior = normalizePriorTurns(options.conversationHistory)

    // 1. Rewrite follow-ups into a standalone retrieval query when history exists
    const retrievalQuery = await rewriteQueryForRetrieval(
      query,
      prior,
      variant,
      options.llmHandles,
      options.abortSignal
    )

    if (options.abortSignal?.aborted) return

    yield { type: 'retrieval_query', retrievalQuery }

    // 2. Retrieve relevant chunks using the standalone query
    const { results: citations, debug: retrievalDebug } = await retrieveChunks(retrievalQuery, {
      embeddingModelId: options.embeddingModelId,
      projectId: options.projectId,
      documentId: options.documentId,
      documentIds: options.documentIds,
    })

    const debug: RagDebugInfo = {
      userQuery: query,
      retrievalQuery,
      wasRewritten: retrievalQuery.trim() !== query.trim(),
      historyTurnCount: prior.length,
      retrieval: retrievalDebug,
    }

    yield { type: 'debug', debug }
    yield { type: 'citations', citations }

    if (citations.length === 0) {
      yield {
        type: 'text_delta',
        text: 'No relevant information found in the documents to answer this query.',
      }
      yield { type: 'done' }
      return
    }

    // 3. Build context block for the answer turn
    const contextText = citations
      .map(
        (c, idx) =>
          `[Source ${idx + 1}] (${c.documentName}${c.metadata.pageNumber ? `, Page ${c.metadata.pageNumber}` : ''}):\n${c.text}`
      )
      .join('\n\n')

    const systemPrompt = `You are a helpful assistant answering user queries based on the provided document excerpts.
Answer the query as accurately as possible using only the context provided.
Use prior conversation turns for continuity when the user refers to earlier questions or answers.
For statements that rely on a source, cite the source number like [1] or [2] matching the source indexes from the context.
If the context doesn't contain enough information to answer, state that you don't know based on the context.

Context Excerpts:
${contextText}`

    const messages: RuntimeMessage[] = [...prior, { role: 'user', content: query }]

    // 4. Stream LLM answer with full conversation memory
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
