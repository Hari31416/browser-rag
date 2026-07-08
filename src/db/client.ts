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
