import { getDb } from '@/db/client'

export interface Project {
  id: string
  name: string
  description: string | null
  embeddingModelId: string
  chunkSize: number
  chunkOverlap: number
  retrievalTopK: number
  hybridRetrievalEnabled: boolean
  createdAt: string
}

interface ProjectRow {
  id: string
  name: string
  description: string | null
  embedding_model_id: string
  chunk_size: number
  chunk_overlap: number
  retrieval_top_k: number
  hybrid_retrieval_enabled: boolean
  created_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    embeddingModelId: row.embedding_model_id,
    chunkSize: row.chunk_size,
    chunkOverlap: row.chunk_overlap,
    retrievalTopK: row.retrieval_top_k,
    hybridRetrievalEnabled: row.hybrid_retrieval_enabled,
    createdAt: row.created_at,
  }
}

export async function listProjects(): Promise<Project[]> {
  const db = getDb()
  const res = await db.query<ProjectRow>(
    'SELECT * FROM projects ORDER BY created_at ASC'
  )
  return res.rows.map(rowToProject)
}

export async function getProject(id: string): Promise<Project | null> {
  const db = getDb()
  const res = await db.query<ProjectRow>('SELECT * FROM projects WHERE id = $1', [id])
  if (res.rows.length === 0) return null
  return rowToProject(res.rows[0])
}

export async function createProject(
  name: string,
  description: string,
  embeddingModelId: string
): Promise<Project> {
  const db = getDb()
  const id = crypto.randomUUID()
  await db.query(
    'INSERT INTO projects (id, name, description, embedding_model_id) VALUES ($1, $2, $3, $4)',
    [id, name, description || null, embeddingModelId]
  )
  const project = await getProject(id)
  if (!project) throw new Error('Failed to create project')
  return project
}

export async function updateProject(
  id: string,
  updates: Partial<Omit<Project, 'id' | 'createdAt'>>
): Promise<Project> {
  const db = getDb()
  const fields: string[] = []
  const values: any[] = []
  
  if (updates.name !== undefined) {
    fields.push(`name = $${fields.length + 1}`)
    values.push(updates.name)
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${fields.length + 1}`)
    values.push(updates.description)
  }
  if (updates.embeddingModelId !== undefined) {
    fields.push(`embedding_model_id = $${fields.length + 1}`)
    values.push(updates.embeddingModelId)
  }
  if (updates.chunkSize !== undefined) {
    fields.push(`chunk_size = $${fields.length + 1}`)
    values.push(updates.chunkSize)
  }
  if (updates.chunkOverlap !== undefined) {
    fields.push(`chunk_overlap = $${fields.length + 1}`)
    values.push(updates.chunkOverlap)
  }
  if (updates.retrievalTopK !== undefined) {
    fields.push(`retrieval_top_k = $${fields.length + 1}`)
    values.push(updates.retrievalTopK)
  }
  if (updates.hybridRetrievalEnabled !== undefined) {
    fields.push(`hybrid_retrieval_enabled = $${fields.length + 1}`)
    values.push(updates.hybridRetrievalEnabled)
  }

  if (fields.length === 0) {
    const project = await getProject(id)
    if (!project) throw new Error('Project not found')
    return project
  }

  values.push(id)
  const query = `UPDATE projects SET ${fields.join(', ')} WHERE id = $${values.length}`
  await db.query(query, values)

  const project = await getProject(id)
  if (!project) throw new Error('Project not found')
  return project
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb()
  await db.query('DELETE FROM projects WHERE id = $1', [id])
}

export async function getProjectDocumentCount(projectId: string): Promise<number> {
  const db = getDb()
  const res = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM documents WHERE project_id = $1',
    [projectId]
  )
  return parseInt(res.rows[0]?.count ?? '0', 10)
}
