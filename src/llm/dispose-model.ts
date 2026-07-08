/** Best-effort teardown for @browser-ai models that lack a public dispose API. */

type Disposable = { dispose?: () => Promise<void> | void }

interface TransformersInternals {
  modelInstance?: unknown[]
  isInitialized?: boolean
  initializationPromise?: Promise<unknown>
  workerReady?: boolean
  config?: { worker?: Worker }
  stoppingCriteria?: { interrupt?: () => void }
}

interface WebLLMInternals {
  engine?: { unload?: () => Promise<void> }
  isInitialized?: boolean
  initializationPromise?: Promise<unknown>
  config?: { options?: { worker?: Worker } }
}

async function disposeComponent(component: unknown): Promise<void> {
  const disposable = component as Disposable
  if (typeof disposable.dispose === 'function') {
    await disposable.dispose()
  }
}

export async function disposeTransformersJSModel(model: unknown): Promise<void> {
  const m = model as TransformersInternals
  m.stoppingCriteria?.interrupt?.()

  if (Array.isArray(m.modelInstance)) {
    for (const part of m.modelInstance) {
      await disposeComponent(part)
    }
  }

  const worker = m.config?.worker
  if (worker) {
    try {
      worker.postMessage({ type: 'reset' })
      worker.terminate()
    } catch {
      // Worker may already be terminated.
    }
  }

  m.modelInstance = undefined
  m.isInitialized = false
  m.initializationPromise = undefined
  m.workerReady = false
}

export async function disposeWebLLMModel(model: unknown): Promise<void> {
  const m = model as WebLLMInternals

  if (m.engine?.unload) {
    try {
      await m.engine.unload()
    } catch (error) {
      console.warn('[WebLLM] engine.unload() failed:', error)
    }
  }

  const worker = m.config?.options?.worker
  if (worker) {
    try {
      worker.terminate()
    } catch {
      // Worker may already be terminated.
    }
  }

  m.engine = undefined
  m.isInitialized = false
  m.initializationPromise = undefined
}
