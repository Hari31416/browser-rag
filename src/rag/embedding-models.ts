export interface EmbeddingModelConfig {
  id: string
  providerId: string
  engine: 'transformers-js' | 'remote'
  modelId: string
  displayName: string
  dimensions: number
  maxInputTokens: number
  requiresPrefix: boolean
  queryPrefix?: string
  passagePrefix?: string
  normalize: boolean
  defaultPooling: 'mean' | 'cls'
  browserSupport: string
}

export const EMBEDDING_MODELS: EmbeddingModelConfig[] = [
  {
    id: 'supabase-gte-small',
    providerId: 'local',
    engine: 'transformers-js',
    modelId: 'Supabase/gte-small',
    displayName: 'GTE Small (Local)',
    dimensions: 384,
    maxInputTokens: 512,
    requiresPrefix: false,
    normalize: true,
    defaultPooling: 'mean',
    browserSupport: 'WebGPU / WASM',
  },
  {
    id: 'xenova-all-minilm-l6-v2',
    providerId: 'local',
    engine: 'transformers-js',
    modelId: 'Xenova/all-MiniLM-L6-v2',
    displayName: 'All MiniLM L6 v2 (Local)',
    dimensions: 384,
    maxInputTokens: 512,
    requiresPrefix: false,
    normalize: true,
    defaultPooling: 'mean',
    browserSupport: 'WebGPU / WASM',
  },
]

export function getEmbeddingModelConfig(modelId: string): EmbeddingModelConfig | undefined {
  return EMBEDDING_MODELS.find((m) => m.id === modelId)
}
