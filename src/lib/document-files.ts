const DB_NAME = 'browser-rag-files'
const STORE_NAME = 'files'
const DB_VERSION = 1

export interface StoredDocumentFile {
  docId: string
  fileName: string
  mimeType: string
  bytes: ArrayBuffer
}

function openFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'docId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open file store'))
  })
}

export async function saveDocumentFile(
  docId: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array
): Promise<void> {
  const db = await openFilesDb()
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ docId, fileName, mimeType, bytes: buffer } satisfies StoredDocumentFile)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save document file'))
  })
  db.close()
}

export async function getDocumentFile(docId: string): Promise<StoredDocumentFile | null> {
  const db = await openFilesDb()
  const result = await new Promise<StoredDocumentFile | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(docId)
    req.onsuccess = () => resolve((req.result as StoredDocumentFile | undefined) ?? null)
    req.onerror = () => reject(req.error ?? new Error('Failed to read document file'))
  })
  db.close()
  return result
}

export async function deleteDocumentFile(docId: string): Promise<void> {
  const db = await openFilesDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(docId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete document file'))
  })
  db.close()
}
