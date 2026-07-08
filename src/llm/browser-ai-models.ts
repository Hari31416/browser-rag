import { transformersJS, type TransformersJSLanguageModel } from '@browser-ai/transformers-js'
import { webLLM, type WebLLMLanguageModel } from '@browser-ai/web-llm'
import type { PretrainedModelOptions } from '@huggingface/transformers'

function isVisionModelId(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return (
    id.includes('qwen3.5') ||
    id.includes('qwen3_5') ||
    id.includes('gemma-4') ||
    id.includes('gemma_4')
  )
}

/** Per-model dtype — avoids `auto` loading fp16 weights and blowing past RAM. */
function resolveTransformersDtype(modelId: string): PretrainedModelOptions['dtype'] {
  const id = modelId.toLowerCase()
  if (id.includes('gemma-4') || id.includes('gemma_4')) {
    return 'q4f16'
  }
  if (id.includes('qwen3.5') || id.includes('qwen3_5')) {
    return {
      embed_tokens: 'q4',
      vision_encoder: 'fp16',
      decoder_model_merged: 'q4',
    }
  }
  return 'q4'
}

export function createTransformersModel(
  modelId: string,
  onProgress?: (pct: number) => void,
): TransformersJSLanguageModel {
  return transformersJS(modelId, {
    device: 'webgpu',
    dtype: resolveTransformersDtype(modelId),
    isVisionModel: isVisionModelId(modelId),
    initProgressCallback: onProgress
      ? (progress) => onProgress(Math.round(progress * 100))
      : undefined,
  })
}

export function createWebLLMModel(
  modelId: string,
  onProgress?: (pct: number) => void,
): WebLLMLanguageModel {
  return webLLM(modelId, {
    initProgressCallback: onProgress
      ? (report) => onProgress(Math.round((report.progress ?? 0) * 100))
      : undefined,
  })
}

export function isHeavyVisionModel(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return id.includes('gemma-4') || id.includes('gemma_4')
}

export function getTransformersLoadMessage(modelId: string, progress: number): string | undefined {
  if (progress < 95) return undefined
  return isHeavyVisionModel(modelId)
    ? 'Initializing WebGPU session (Gemma 4 can take 1–3 min, ~6–8 GB RAM)...'
    : 'Initializing WebGPU session...'
}
