export interface Preferences {
  activeProjectId: string | null
  llmModelId: string
  llmVariantId: string
  chunkSize: number
  chunkOverlap: number
  retrievalTopK: number
  hybridRetrievalEnabled: boolean
}

const DEFAULT_PREFERENCES: Preferences = {
  activeProjectId: null,
  llmModelId: 'qwen-3.5-0.8b',
  llmVariantId: 'transformers-js',
  chunkSize: 500,
  chunkOverlap: 100,
  retrievalTopK: 5,
  hybridRetrievalEnabled: true,
}

const STORAGE_KEY = 'browser-rag-preferences'

export function loadPreferences(): Preferences {
  const data = localStorage.getItem(STORAGE_KEY)
  if (!data) return DEFAULT_PREFERENCES
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(data) }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(prefs: Partial<Preferences>): Preferences {
  const current = loadPreferences()
  const updated = { ...current, ...prefs }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}
