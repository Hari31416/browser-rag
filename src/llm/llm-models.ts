const isIOS =
  typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)

export const DEFAULT_LLM_ID = isIOS ? "qwen2.5-0.5b" : "qwen35-0.8b"
export const DEFAULT_VARIANT_ID = isIOS ? "qwen-0.5b" : "qwen35-0.8b"

export type LLMBackend = 'gemma4' | 'webllm' | 'lfm2' | 'qwen35'
export type LLMEngineType = 'gemma4-kernel' | 'lfm2-kernel' | 'transformers-js' | 'webllm'
export type LLMCapability = 'text' | 'vision' | 'thinking' | 'streaming'
export type LLMRequirement = 'webgpu' | 'high-memory' | 'mobile-friendly'
export type LLMRecommendation = 'default' | 'mobile' | 'vision' | 'speed' | 'quality'

export interface LLMModel {
  id: string
  name: string
  family: "gemma" | "qwen" | "llama" | "lfm"
  description?: string
  capabilities: Record<LLMCapability, boolean>
  variants: LLMVariant[]
}

export interface LLMVariant {
  id: string
  modelId: string
  engine: LLMEngineType
  label: string
  engineModelId: string
  capabilities: Record<LLMCapability, boolean>
  requirements: LLMRequirement[]
  sizeMb: number
  sizeLabel: string
  tokenLimits: { voice: number; text: number }
  recommendedFor: LLMRecommendation[]
}

export interface LLMOption {
  id: string
  logicalModelId: string
  name: string
  family: 'gemma' | 'qwen' | 'llama' | 'lfm'
  variantLabel?: string
  backend: LLMBackend
  engineType: LLMEngineType
  webllmId?: string
  lfmModelId?: string
  qwen35ModelId?: string
  capabilities: Record<LLMCapability, boolean>
  requirements: LLMRequirement[]
  recommendedFor: LLMRecommendation[]
  sizeLabel: string
  sizeMb: number
  tokenLimits: { voice: number; text: number }
}

export const LLM_MODELS: LLMModel[] = [
  {
    id: 'qwen35-0.8b',
    name: 'Qwen 3.5 0.8B',
    family: 'qwen',
    capabilities: { text: true, vision: true, thinking: true, streaming: true },
    variants: [
      {
        id: 'qwen35-0.8b',
        modelId: 'qwen35-0.8b',
        engine: 'transformers-js',
        label: 'Transformers.js',
        engineModelId: 'onnx-community/Qwen3.5-0.8B-ONNX-OPT',
        capabilities: { text: true, vision: true, thinking: true, streaming: true },
        requirements: ['webgpu', 'mobile-friendly'],
        recommendedFor: ['default', 'mobile', 'vision'],
        sizeMb: 800,
        sizeLabel: '~800 MB',
        tokenLimits: { voice: 256, text: 1024 },
      }
    ]
  },
  {
    id: 'qwen35-2b',
    name: 'Qwen 3.5 2B',
    family: 'qwen',
    capabilities: { text: true, vision: true, thinking: true, streaming: true },
    variants: [
      {
        id: 'qwen35-2b',
        modelId: 'qwen35-2b',
        engine: 'transformers-js',
        label: 'Transformers.js',
        engineModelId: 'onnx-community/Qwen3.5-2B-ONNX-OPT',
        capabilities: { text: true, vision: true, thinking: true, streaming: true },
        requirements: ['webgpu', 'high-memory'],
        recommendedFor: ['vision', 'quality'],
        sizeMb: 2048,
        sizeLabel: '~2 GB',
        tokenLimits: { voice: 256, text: 1536 },
      }
    ]
  },
  {
    id: 'qwen35-4b',
    name: 'Qwen 3.5 4B',
    family: 'qwen',
    capabilities: { text: true, vision: true, thinking: true, streaming: true },
    variants: [
      {
        id: 'qwen35-4b',
        modelId: 'qwen35-4b',
        engine: 'transformers-js',
        label: 'Transformers.js',
        engineModelId: 'onnx-community/Qwen3.5-4B-ONNX-OPT',
        capabilities: { text: true, vision: true, thinking: true, streaming: true },
        requirements: ['webgpu', 'high-memory'],
        recommendedFor: ['vision', 'quality'],
        sizeMb: 4096,
        sizeLabel: '~4 GB',
        tokenLimits: { voice: 256, text: 2048 },
      }
    ]
  },
  {
    id: 'gemma-4-e2b',
    name: 'Gemma 4 E2B',
    family: 'gemma',
    capabilities: { text: true, vision: true, thinking: true, streaming: true },
    variants: [
      {
        id: 'gemma-4-e2b-kernel',
        modelId: 'gemma-4-e2b',
        engine: 'gemma4-kernel',
        label: 'Custom kernels',
        engineModelId: 'google/gemma-4-E2B-it-qat-mobile-transformers',
        capabilities: { text: true, vision: false, thinking: true, streaming: true },
        requirements: ['webgpu', 'high-memory'],
        recommendedFor: ['default', 'quality'],
        sizeMb: 3277,
        sizeLabel: '~3.2 GB',
        tokenLimits: { voice: 128, text: 512 },
      },
      {
        id: 'gemma-4-e2b-transformers',
        modelId: 'gemma-4-e2b',
        engine: 'transformers-js',
        label: 'Transformers.js',
        engineModelId: 'onnx-community/gemma-4-E2B-it-ONNX',
        capabilities: { text: true, vision: true, thinking: true, streaming: true },
        requirements: ['webgpu', 'high-memory'],
        recommendedFor: ['vision', 'quality'],
        sizeMb: 3277,
        sizeLabel: '~3.2 GB',
        tokenLimits: { voice: 128, text: 512 },
      }
    ]
  },
  {
    id: 'lfm2-230m',
    name: 'Liquid LFM 2.5 230M',
    family: 'lfm',
    capabilities: { text: true, vision: false, thinking: false, streaming: true },
    variants: [
      {
        id: 'lfm2-230m',
        modelId: 'lfm2-230m',
        engine: 'lfm2-kernel',
        label: 'Custom kernels',
        engineModelId: 'LiquidAI/LFM2.5-230M-GGUF',
        capabilities: { text: true, vision: false, thinking: false, streaming: true },
        requirements: ['webgpu', 'mobile-friendly'],
        recommendedFor: ['default', 'mobile', 'speed'],
        sizeMb: 230,
        sizeLabel: '~230 MB',
        tokenLimits: { voice: 192, text: 768 },
      },
      {
        id: 'lfm2-230m-transformers',
        modelId: 'lfm2-230m',
        engine: 'transformers-js',
        label: 'Transformers.js',
        engineModelId: 'LiquidAI/LFM2.5-230M-ONNX',
        capabilities: { text: true, vision: false, thinking: false, streaming: true },
        requirements: ['webgpu', 'mobile-friendly'],
        recommendedFor: ['mobile', 'speed'],
        sizeMb: 230,
        sizeLabel: '~230 MB',
        tokenLimits: { voice: 192, text: 768 },
      }
    ]
  },
  {
    id: 'lfm2-350m',
    name: 'Liquid LFM 2.5 350M',
    family: 'lfm',
    capabilities: { text: true, vision: false, thinking: false, streaming: true },
    variants: [
      {
        id: 'lfm2-350m',
        modelId: 'lfm2-350m',
        engine: 'lfm2-kernel',
        label: 'Custom kernels',
        engineModelId: 'LiquidAI/LFM2.5-350M-GGUF',
        capabilities: { text: true, vision: false, thinking: false, streaming: true },
        requirements: ['webgpu', 'mobile-friendly'],
        recommendedFor: ['default', 'mobile', 'speed'],
        sizeMb: 350,
        sizeLabel: '~350 MB',
        tokenLimits: { voice: 256, text: 1024 },
      },
      {
        id: 'lfm2-350m-transformers',
        modelId: 'lfm2-350m',
        engine: 'transformers-js',
        label: 'Transformers.js',
        engineModelId: 'LiquidAI/LFM2.5-350M-ONNX',
        capabilities: { text: true, vision: false, thinking: false, streaming: true },
        requirements: ['webgpu', 'mobile-friendly'],
        recommendedFor: ['mobile', 'speed'],
        sizeMb: 350,
        sizeLabel: '~350 MB',
        tokenLimits: { voice: 256, text: 1024 },
      }
    ]
  },
  {
    id: 'qwen2.5-0.5b',
    name: 'Qwen 0.5B',
    family: 'qwen',
    capabilities: { text: true, vision: false, thinking: false, streaming: true },
    variants: [
      {
        id: 'qwen-0.5b',
        modelId: 'qwen2.5-0.5b',
        engine: 'webllm',
        label: 'WebLLM',
        engineModelId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
        capabilities: { text: true, vision: false, thinking: false, streaming: true },
        requirements: ['webgpu', 'mobile-friendly'],
        recommendedFor: ['default', 'mobile', 'speed'],
        sizeMb: 400,
        sizeLabel: '~400 MB',
        tokenLimits: { voice: 192, text: 768 },
      }
    ]
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B',
    family: 'llama',
    capabilities: { text: true, vision: false, thinking: false, streaming: true },
    variants: [
      {
        id: 'llama-3.2-1b',
        modelId: 'llama-3.2-1b',
        engine: 'webllm',
        label: 'WebLLM',
        engineModelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        capabilities: { text: true, vision: false, thinking: false, streaming: true },
        requirements: ['webgpu', 'mobile-friendly'],
        recommendedFor: ['default', 'mobile'],
        sizeMb: 700,
        sizeLabel: '~700 MB',
        tokenLimits: { voice: 256, text: 1024 },
      }
    ]
  },
  {
    id: 'gemma-2-2b',
    name: 'Gemma 2B',
    family: 'gemma',
    capabilities: { text: true, vision: false, thinking: false, streaming: true },
    variants: [
      {
        id: 'gemma-2-2b-webllm',
        modelId: 'gemma-2-2b',
        engine: 'webllm',
        label: 'WebLLM',
        engineModelId: 'gemma-2-2b-it-q4f16_1-MLC',
        capabilities: { text: true, vision: false, thinking: false, streaming: true },
        requirements: ['webgpu'],
        recommendedFor: ['default', 'quality'],
        sizeMb: 1536,
        sizeLabel: '~1.5 GB',
        tokenLimits: { voice: 256, text: 1024 },
      }
    ]
  },
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B',
    family: 'llama',
    capabilities: { text: true, vision: false, thinking: false, streaming: true },
    variants: [
      {
        id: 'llama-3.2-3b',
        modelId: 'llama-3.2-3b',
        engine: 'webllm',
        label: 'WebLLM',
        engineModelId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
        capabilities: { text: true, vision: false, thinking: false, streaming: true },
        requirements: ['webgpu', 'high-memory'],
        recommendedFor: ['default', 'quality'],
        sizeMb: 2048,
        sizeLabel: '~2 GB',
        tokenLimits: { voice: 256, text: 1536 },
      }
    ]
  }
]

export function resolveModelBackend(model: LLMModel): LLMBackend {
  switch (model.family) {
    case 'gemma':
      return 'gemma4'
    case 'lfm':
      return 'lfm2'
    case 'qwen':
      return 'qwen35'
    default:
      return 'webllm'
  }
}

export function resolveVariantBackend(variantId: string): LLMBackend {
  const variant = getLLMVariant(variantId)
  return resolveModelBackend(getLLMModel(variant.modelId))
}

export const LLM_OPTIONS: LLMOption[] = LLM_MODELS.flatMap((model) =>
  model.variants.map((variant) => {
    const backend = resolveModelBackend(model)

    return {
      id: variant.id,
      logicalModelId: model.id,
      name: model.name,
      family: model.family,
      variantLabel: variant.label,
      backend,
      engineType: variant.engine,
      webllmId: variant.engine === 'webllm' ? variant.engineModelId : undefined,
      lfmModelId: variant.engine === 'lfm2-kernel' ? variant.engineModelId : undefined,
      qwen35ModelId: variant.engine === 'transformers-js' ? variant.engineModelId : undefined,
      capabilities: variant.capabilities,
      requirements: variant.requirements,
      recommendedFor: variant.recommendedFor,
      sizeLabel: variant.sizeLabel,
      sizeMb: variant.sizeMb,
      tokenLimits: variant.tokenLimits,
    }
  })
)

export function getLLMModel(id: string): LLMModel {
  return LLM_MODELS.find((m) => m.id === id) ?? LLM_MODELS[0]
}

export function getLLMVariant(id: string): LLMVariant {
  for (const model of LLM_MODELS) {
    const variant = model.variants.find((v) => v.id === id)
    if (variant) return variant
  }
  const fallbackModel = LLM_MODELS[0]
  return fallbackModel.variants[0]
}

export function getLLMOption(id: string): LLMOption {
  return LLM_OPTIONS.find((o) => o.id === id) ?? LLM_OPTIONS[0]
}

export function hasLLMCapability(option: LLMOption | LLMVariant | LLMModel, capability: LLMCapability): boolean {
  return option.capabilities[capability] === true
}

export function getLLMEngineModelId(option: LLMOption): string {
  switch (option.engineType) {
    case 'gemma4-kernel':
      return option.id
    case 'lfm2-kernel':
      return option.lfmModelId ?? ''
    case 'transformers-js':
      return option.qwen35ModelId ?? ''
    case 'webllm':
      return option.webllmId ?? ''
  }
}

export function getLLMVariants(logicalModelId: string): LLMOption[] {
  return LLM_OPTIONS.filter((option) => option.logicalModelId === logicalModelId)
}

export function getLLMMaxTokens(option: LLMOption | LLMVariant, ttsEnabled: boolean): number {
  return ttsEnabled ? option.tokenLimits.voice : option.tokenLimits.text
}

export function selectBestVariant(options: {
  model: LLMModel
  preferredEngine?: string
}): LLMVariant {
  const { model, preferredEngine } = options
  if (preferredEngine) {
    const preferred = model.variants.find((v) => v.engine === preferredEngine)
    if (preferred) return preferred
  }
  const defaultVar = model.variants.find((v) => v.recommendedFor.includes('default'))
  if (defaultVar) return defaultVar
  return model.variants[0]
}

export function selectBestVariantForModel(model: LLMModel): LLMVariant {
  return selectBestVariant({ model })
}
