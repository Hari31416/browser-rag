import {
  createTransformersModel,
  getTransformersLoadMessage,
} from '@/llm/browser-ai-models'
import { disposeTransformersJSModel } from '@/llm/dispose-model'
import { isLfmOnnxModel, patchLfmTransformersChatTemplate } from '@/llm/lfm-transformers'
import { useBrowserAiEngine, type BrowserAiEngineStatus } from '@/hooks/use-browser-ai-engine'

export const QWEN35_MODELS = {
  'qwen35-0.8b': 'onnx-community/Qwen3.5-0.8B-ONNX-OPT',
  'qwen35-2b': 'onnx-community/Qwen3.5-2B-ONNX-OPT',
  'qwen35-4b': 'onnx-community/Qwen3.5-4B-ONNX-OPT',
} as const

export type Qwen35ModelId = string
export type Qwen35Status = BrowserAiEngineStatus

interface UseQwen35Options {
  onStatusChange?: (status: Qwen35Status) => void
  onError?: (error: Error) => void
  onLoadMessage?: (message: string) => void
}

export function useQwen35(options: UseQwen35Options = {}) {
  return useBrowserAiEngine({
    engineLabel: 'TransformersEngine',
    provider: 'transformers-js',
    createModel: createTransformersModel,
    disposeModel: disposeTransformersJSModel,
    getLoadMessage: getTransformersLoadMessage,
    onModelCreated: (model, modelId) => {
      if (isLfmOnnxModel(modelId)) {
        patchLfmTransformersChatTemplate(model)
      }
    },
    ...options,
  })
}
