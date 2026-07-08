import { pipeline } from '@huggingface/transformers'

let extractor: any = null
let currentModelId: string | null = null

self.onmessage = async (e: MessageEvent) => {
  const { id, action, modelId, texts } = e.data

  if (action === 'load') {
    try {
      if (extractor && currentModelId === modelId) {
        self.postMessage({ id, status: 'success' })
        return
      }

      const progressCallback = (event: any) => {
        if (event.status === 'progress') {
          self.postMessage({
            id,
            status: 'progress',
            file: event.file,
            progress: event.progress,
            loaded: event.loaded,
            total: event.total,
          })
        }
      }

      extractor = await pipeline('feature-extraction', modelId, {
        progress_callback: progressCallback,
        device: 'webgpu',
        dtype: 'q8',
      })
      currentModelId = modelId

      self.postMessage({ id, status: 'success' })
    } catch (err: any) {
      self.postMessage({ id, status: 'error', error: err?.message || 'Failed to load model' })
    }
  } else if (action === 'embed') {
    try {
      if (!extractor) {
        self.postMessage({ id, status: 'error', error: 'Extractor not loaded' })
        return
      }

      if (!texts || texts.length === 0) {
        self.postMessage({ id, status: 'success', embeddings: [] })
        return
      }

      const embeddings: number[][] = []

      for (let i = 0; i < texts.length; i++) {
        const text = texts[i]

        self.postMessage({
          id,
          status: 'embed_progress',
          current: i,
          total: texts.length,
        })

        const output = await extractor(text, {
          pooling: 'mean',
          normalize: true,
        })

        const vector = Array.from(output.data as Float32Array)
        embeddings.push(vector)
      }

      self.postMessage({ id, status: 'success', embeddings })
    } catch (err: any) {
      self.postMessage({ id, status: 'error', error: err?.message || 'Embedding failed' })
    }
  } else if (action === 'unload') {
    extractor = null
    currentModelId = null
    self.postMessage({ id, status: 'success' })
  }
}
export {}
