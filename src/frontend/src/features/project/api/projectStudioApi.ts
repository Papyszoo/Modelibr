import { client } from '@/lib/apiBase'

export type ProjectLevelStatus =
  | 'planned'
  | 'in_progress'
  | 'review'
  | 'blocked'
  | 'done'

export interface ProjectLevelDto {
  id: number
  projectId: number
  name: string
  description: string | null
  productionStatus: ProjectLevelStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ProjectLevelRequest {
  name: string
  description?: string | null
  productionStatus?: ProjectLevelStatus
  sortOrder?: number
}

export interface ProductionNoteDto {
  id: number
  projectId: number
  levelId: number | null
  referenceImageId: number | null
  title: string
  body: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductionNoteRequest {
  levelId?: number | null
  referenceImageId?: number | null
  title: string
  body: string
  isPinned: boolean
}

export interface ProjectReferenceDto {
  id: number
  projectId: number
  projectLevelId: number | null
  title: string
  fileId: number
  fileName: string
  previewUrl: string
  fileUrl: string
  sortOrder: number
}

export interface ProjectReferenceRequest {
  title?: string | null
  projectLevelId?: number | null
}

export async function getProjectLevels(
  projectId: number
): Promise<ProjectLevelDto[]> {
  const response = await client.get<ProjectLevelDto[]>(
    `/projects/${projectId}/levels`
  )
  return response.data
}

export async function createProjectLevel(
  projectId: number,
  request: ProjectLevelRequest
): Promise<ProjectLevelDto> {
  const response = await client.post<ProjectLevelDto>(
    `/projects/${projectId}/levels`,
    request
  )
  return response.data
}

export async function updateProjectLevel(
  projectId: number,
  levelId: number,
  request: ProjectLevelRequest
): Promise<ProjectLevelDto> {
  const response = await client.put<ProjectLevelDto>(
    `/projects/${projectId}/levels/${levelId}`,
    request
  )
  return response.data
}

export async function deleteProjectLevel(
  projectId: number,
  levelId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/levels/${levelId}`)
}

export async function getProductionNotes(
  projectId: number,
  options: { levelId?: number; isPinned?: boolean } = {}
): Promise<ProductionNoteDto[]> {
  const params = new URLSearchParams()
  if (options.levelId !== undefined) {
    params.set('levelId', String(options.levelId))
  }
  if (options.isPinned !== undefined) {
    params.set('isPinned', String(options.isPinned))
  }
  const query = params.toString()
  const response = await client.get<ProductionNoteDto[]>(
    `/projects/${projectId}/production-notes${query ? `?${query}` : ''}`
  )
  return response.data
}

export async function createProductionNote(
  projectId: number,
  request: ProductionNoteRequest
): Promise<ProductionNoteDto> {
  const response = await client.post<ProductionNoteDto>(
    `/projects/${projectId}/production-notes`,
    request
  )
  return response.data
}

export async function updateProductionNote(
  projectId: number,
  noteId: number,
  request: ProductionNoteRequest
): Promise<ProductionNoteDto> {
  const response = await client.put<ProductionNoteDto>(
    `/projects/${projectId}/production-notes/${noteId}`,
    request
  )
  return response.data
}

export async function deleteProductionNote(
  projectId: number,
  noteId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/production-notes/${noteId}`)
}

export async function getProjectReferences(
  projectId: number,
  levelId?: number
): Promise<ProjectReferenceDto[]> {
  const params = new URLSearchParams()
  if (levelId !== undefined) params.set('levelId', String(levelId))
  const query = params.toString()
  const response = await client.get<ProjectReferenceDto[]>(
    `/projects/${projectId}/references${query ? `?${query}` : ''}`
  )
  return response.data
}

export async function updateProjectReference(
  projectId: number,
  referenceId: number,
  request: ProjectReferenceRequest
): Promise<ProjectReferenceDto> {
  const response = await client.put<ProjectReferenceDto>(
    `/projects/${projectId}/references/${referenceId}`,
    request
  )
  return response.data
}
