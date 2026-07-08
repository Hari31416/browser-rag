export interface EmbedOptions {
  abortSignal?: AbortSignal
  onProgress?: (progress: {
    type: 'load' | 'embed'
    current?: number
    total?: number
    file?: string
    progress?: number
  }) => void
}

export interface EmbeddingResult {
  embedding: number[]
}

export interface EmbeddingProvider {
  id: string
  displayName: string
  load(modelId: string, onProgress?: (progress: number) => void): Promise<void>
  unload(): Promise<void>
  embedTexts(texts: string[], options?: EmbedOptions): Promise<EmbeddingResult[]>
  embedQuery(text: string, options?: EmbedOptions): Promise<EmbeddingResult>
}
