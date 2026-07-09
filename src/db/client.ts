import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { runMigrations } from './migrations'

let dbInstance: PGlite | null = null
let initPromise: Promise<PGlite> | null = null

export async function initDb(): Promise<PGlite> {
  if (dbInstance) return dbInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const db = await PGlite.create('idb://browser-rag', {
        extensions: { vector },
      })
      await runMigrations(db)
      dbInstance = db
      return db
    } catch (error) {
      initPromise = null
      console.error('Failed to initialize database:', error)
      throw error
    }
  })()

  return initPromise
}

export function getDb(): PGlite {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return dbInstance
}

export function isDbInitialized(): boolean {
  return dbInstance !== null
}

export async function exportDb(): Promise<Blob> {
  const db = getDb()

  // Sync UI preferences from localStorage to DB before dumping
  try {
    const prefs = localStorage.getItem('browser-rag-preferences')
    if (prefs) {
      await db.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        ['ui:preferences', prefs]
      )
    }
  } catch (err) {
    console.warn('Failed to sync preferences to database during export:', err)
  }

  return await db.dumpDataDir()
}

export async function importDb(file: File | Blob): Promise<void> {
  if (dbInstance) {
    try {
      await dbInstance.close()
    } catch (err) {
      console.warn('Error closing database instance:', err)
    }
    dbInstance = null
  }
  initPromise = null

  // Delete the IndexedDB database to clear any existing data
  // PGlite (via Emscripten IDBFS) prefixes the database name with '/db/'
  const deletedNames = new Set<string>()

  if (typeof indexedDB.databases === 'function') {
    try {
      const dbs = await indexedDB.databases()
      for (const dbInfo of dbs) {
        if (dbInfo.name && dbInfo.name.includes('browser-rag')) {
          const name = dbInfo.name
          try {
            await new Promise<void>((resolve, reject) => {
              const req = indexedDB.deleteDatabase(name)
              req.onsuccess = () => resolve()
              req.onerror = () => reject(new Error(`Failed to delete database: ${name}`))
              req.onblocked = () => {
                console.warn(`Database deletion blocked for ${name}. Proceeding.`)
                resolve()
              }
            })
            deletedNames.add(name)
          } catch (err) {
            console.warn(`Error during IndexedDB deletion for query-discovered ${name}:`, err)
          }
        }
      }
    } catch (err) {
      console.warn('Failed to query or delete databases via indexedDB.databases():', err)
    }
  }

  // Fallback / standard deletions
  const fallbackDbNames = ['browser-rag', '/db/browser-rag']
  for (const name of fallbackDbNames) {
    if (deletedNames.has(name)) continue
    try {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(new Error(`Failed to delete database: ${name}`))
        req.onblocked = () => {
          console.warn(`Database deletion blocked for ${name}. Attempting to proceed.`)
          resolve()
        }
      })
    } catch (err) {
      console.warn(`Error during IndexedDB deletion for fallback ${name}:`, err)
    }
  }

  // Re-create the database instance with loadDataDir
  initPromise = (async () => {
    try {
      const db = await PGlite.create('idb://browser-rag', {
        extensions: { vector },
        loadDataDir: file,
      })
      await runMigrations(db)
      dbInstance = db

      // Restore UI preferences from settings table to localStorage
      try {
        const res = await db.query<{ value: string }>(
          "SELECT value FROM settings WHERE key = 'ui:preferences'"
        )
        if (res.rows.length > 0 && res.rows[0].value) {
          localStorage.setItem('browser-rag-preferences', res.rows[0].value)
        }
      } catch (prefErr) {
        console.warn('Failed to restore UI preferences from database:', prefErr)
      }

      return db
    } catch (error) {
      initPromise = null
      console.error('Failed to import database:', error)
      throw error
    }
  })()

  await initPromise
}

