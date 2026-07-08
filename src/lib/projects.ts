import { getDb } from '@/db/client'

export interface Project {
  id: string
  name: string
  description: string | null
  embeddingModelId: string
  createdAt: string
}

interface ProjectRow {
  id: string
  name: string
  description: string | null
  embedding_model_id: string
  created_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    embeddingModelId: row.embedding_model_id,
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
