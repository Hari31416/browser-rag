export interface Preferences {
  activeProjectId: string | null
  llmModelId: string
  llmVariantId: string
}

const DEFAULT_PREFERENCES: Preferences = {
  activeProjectId: null,
  llmModelId: 'qwen-3.5-0.8b',
  llmVariantId: 'transformers-js',
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
