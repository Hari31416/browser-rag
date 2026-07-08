import { getLLMModel, type LLMEngineType, type LLMModel, type LLMVariant } from './llm-models'

export type LLMEngineFeature = 'nativeThinking' | 'nativeTools'

export const ENGINE_FEATURES: Record<LLMEngineType, readonly LLMEngineFeature[]> = {
  'transformers-js': ['nativeThinking'],
  webllm: ['nativeThinking', 'nativeTools'],
  'gemma4-kernel': [],
  'lfm2-kernel': [],
}

export function engineHasNativeFeature(
  engine: LLMEngineType,
  feature: LLMEngineFeature,
): boolean {
  return ENGINE_FEATURES[engine].includes(feature)
}

export function modelHasNativeThinking(model: LLMModel): boolean {
  return model.variants.some(
    (v) => v.capabilities.thinking && engineHasNativeFeature(v.engine, 'nativeThinking'),
  )
}

export function variantHasNativeThinking(variant: LLMVariant): boolean {
  return (
    variant.capabilities.thinking &&
    engineHasNativeFeature(variant.engine, 'nativeThinking')
  )
}

export function variantHasParsedThinking(variant: LLMVariant): boolean {
  return variant.capabilities.thinking && variant.engine === 'gemma4-kernel'
}

export function variantHasNativeTools(variant: LLMVariant): boolean {
  return engineHasNativeFeature(variant.engine, 'nativeTools')
}

function variantFamilySupportsTools(variant: LLMVariant): boolean {
  const family = getLLMModel(variant.modelId).family
  return family !== 'lfm' && family !== 'llama'
}

/** Models that follow tool-call instructions reliably (auto-enabled). */
export function variantSupportsToolsReliably(variant: LLMVariant): boolean {
  if (!variantFamilySupportsTools(variant)) return false
  const model = getLLMModel(variant.modelId)
  return model.family === 'gemma' && variant.engine === 'transformers-js'
}

/** Models with tool plumbing but unreliable instruction-following (opt-in). */
export function variantSupportsToolsExperimental(variant: LLMVariant): boolean {
  if (!variantFamilySupportsTools(variant)) return false
  if (variantSupportsToolsReliably(variant)) return false
  return (
    variantHasNativeTools(variant) ||
    variant.engine === 'transformers-js' ||
    variant.engine === 'gemma4-kernel'
  )
}

export function variantSupportsTools(variant: LLMVariant): boolean {
  return (
    variantSupportsToolsReliably(variant) ||
    variantSupportsToolsExperimental(variant)
  )
}

export function shouldEnableTools(
  variant: LLMVariant,
  experimentalToolsEnabled: boolean,
): boolean {
  if (variantSupportsToolsReliably(variant)) return true
  return experimentalToolsEnabled && variantSupportsToolsExperimental(variant)
}

export function variantSupportsExperimentalToolsToggle(variant: LLMVariant): boolean {
  return (
    variantSupportsToolsExperimental(variant) &&
    !variantSupportsToolsReliably(variant)
  )
}

export function variantUsesPromptToolFallback(variant: LLMVariant): boolean {
  return shouldEnableTools(variant, true) && !variantHasNativeTools(variant)
}

export function variantHasParsedTools(variant: LLMVariant): boolean {
  return variantUsesPromptToolFallback(variant)
}

export function variantSupportsThinkingToggle(variant: LLMVariant): boolean {
  return variant.capabilities.thinking
}

export function getThinkingToggleHint(variant: LLMVariant): string | null {
  if (!variant.capabilities.thinking) return null
  if (variantHasNativeThinking(variant)) {
    return 'Reasoning is streamed natively by the engine.'
  }
  if (variantHasParsedThinking(variant)) {
    return 'Reasoning is parsed from model output tags. Switch to Transformers.js for native reasoning and vision.'
  }
  return null
}

export function getToolsHint(
  variant: LLMVariant,
  experimentalToolsEnabled = false,
): string | null {
  if (variantSupportsToolsReliably(variant)) {
    return 'Calculator and time tools are enabled for this model.'
  }
  if (!variantSupportsToolsExperimental(variant)) return null
  if (experimentalToolsEnabled) {
    return 'Tool calling is experimental on this model and may not work reliably. Use Gemma 4 with the Transformers.js engine for best results.'
  }
  return 'Tools work reliably on Gemma 4 (Transformers.js). Enable below to try experimental tool calling on this model.'
}
