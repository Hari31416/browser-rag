import type { EmbeddingProvider, EmbeddingResult, EmbedOptions } from './embedding-provider'

export class LocalEmbeddingProvider implements EmbeddingProvider {
  id = 'local'
  displayName = 'Local (Transformers.js)'

  private worker: Worker | null = null
  private activeModelId: string | null = null
  private pendingRequests = new Map<
    string,
    {
      resolve: (val: any) => void
      reject: (err: Error) => void
      onProgress?: (progress: any) => void
    }
  >()

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/embedding.worker.ts', import.meta.url),
        { type: 'module' }
      )

      this.worker.onmessage = (e) => {
        const { id, status, progress, file, current, total, embeddings, error } = e.data
        const request = this.pendingRequests.get(id)
        if (!request) return

        if (status === 'success') {
          this.pendingRequests.delete(id)
          request.resolve(embeddings || null)
        } else if (status === 'progress') {
          if (request.onProgress) {
            request.onProgress({ type: 'load', file, progress })
          }
        } else if (status === 'embed_progress') {
          if (request.onProgress) {
            request.onProgress({ type: 'embed', current, total })
          }
        } else if (status === 'error') {
          this.pendingRequests.delete(id)
          request.reject(new Error(error))
        }
      }

      this.worker.onerror = (err) => {
        console.error('Embedding worker error:', err)
      }
    }
    return this.worker
  }

  async load(
    modelId: string,
    onProgress?: (progress: any) => void
  ): Promise<void> {
    const worker = this.getWorker()
    const id = crypto.randomUUID()

    this.activeModelId = modelId

    return new Promise<void>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: () => resolve(),
        reject,
        onProgress,
      })

      worker.postMessage({
        id,
        action: 'load',
        modelId,
      })
    })
  }

  async unload(): Promise<void> {
    if (!this.worker) return
    const id = crypto.randomUUID()

    this.activeModelId = null

    await new Promise<void>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: () => resolve(),
        reject,
      })

      this.worker!.postMessage({
        id,
        action: 'unload',
      })
    })

    this.worker.terminate()
    this.worker = null
  }

  async embedTexts(
    texts: string[],
    options?: EmbedOptions & { onProgress?: (p: any) => void }
  ): Promise<EmbeddingResult[]> {
    const worker = this.getWorker()
    const id = crypto.randomUUID()

    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        this.pendingRequests.delete(id)
      })
    }

    const rawEmbeddings = await new Promise<number[][]>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve,
        reject,
        onProgress: options?.onProgress,
      })

      worker.postMessage({
        id,
        action: 'embed',
        texts,
      })
    })

    return rawEmbeddings.map((emb) => ({ embedding: emb }))
  }

  async embedQuery(
    text: string,
    options?: EmbedOptions
  ): Promise<EmbeddingResult> {
    const results = await this.embedTexts([text], options)
    if (results.length === 0) throw new Error('Query embedding failed')
    return results[0]
  }

  getActiveModel(): string | null {
    return this.activeModelId
  }
}

export const localProvider = new LocalEmbeddingProvider()

export function getEmbeddingProvider(providerId: string): EmbeddingProvider {
  if (providerId === 'local') return localProvider
  throw new Error(`Unsupported embedding provider: ${providerId}`)
}
