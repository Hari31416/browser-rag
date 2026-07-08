import { createWebLLMModel } from '@/llm/browser-ai-models'
import { disposeWebLLMModel } from '@/llm/dispose-model'
import { useBrowserAiEngine, type BrowserAiEngineStatus } from '@/hooks/use-browser-ai-engine'

export type WebLLMStatus = BrowserAiEngineStatus

export const WEBLLM_MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 1.5B', size: '~1GB' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen 0.5B', size: '~400MB' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 1B', size: '~700MB' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3B', size: '~2GB' },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', name: 'SmolLM 1.7B', size: '~1GB' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2B', size: '~1.5GB' },
] as const

export type WebLLMModel = (typeof WEBLLM_MODELS)[number]['id']

interface UseWebLLMOptions {
  onStatusChange?: (status: WebLLMStatus) => void
  onError?: (error: Error) => void
}

export function useWebLLM(options: UseWebLLMOptions = {}) {
  const engine = useBrowserAiEngine({
    engineLabel: 'WebLLM',
    provider: 'web-llm',
    createModel: createWebLLMModel,
    disposeModel: disposeWebLLMModel,
    ...options,
  })

  return {
    ...engine,
    models: WEBLLM_MODELS,
  }
}
