import { client } from '../../../lib/apiBase'

export interface RecycledModelDto {
  id: number
  name: string
  deletedAt: string
  fileCount: number
}

export interface RecycledModelVersionDto {
  id: number
  modelId: number
  versionNumber: number
  description: string | null
  deletedAt: string
  fileCount: number
}

export interface RecycledTextureSetDto {
  id: number
  name: string
  deletedAt: string
  textureCount: number
  previewFileId?: number | null
}

export interface RecycledSpriteDto {
  id: number
  name: string
  fileId: number
  deletedAt: string
}

export interface RecycledSoundDto {
  id: number
  name: string
  fileId: number
  duration: number
  deletedAt: string
}

export interface GetAllRecycledFilesResponse {
  models: RecycledModelDto[]
  modelVersions: RecycledModelVersionDto[]
  files: unknown[]
  textureSets: RecycledTextureSetDto[]
  textures: unknown[]
  sprites: RecycledSpriteDto[]
  sounds: RecycledSoundDto[]
}

export async function getAllRecycledFiles(): Promise<GetAllRecycledFilesResponse> {
  const response = await client.get('/recycled')
  return response.data
}

export async function restoreEntity(
  entityType: string,
  entityId: number
): Promise<void> {
  await client.post(`/recycled/${entityType}/${entityId}/restore`)
}

export async function getDeletePreview(
  entityType: string,
  entityId: number
): Promise<{
  entityName: string
  filesToDelete: Array<{
    filePath: string
    originalFileName: string
    sizeBytes: number
  }>
  relatedEntities: string[]
}> {
  const response = await client.get(
    `/recycled/${entityType}/${entityId}/preview`
  )
  return response.data
}

export async function permanentlyDeleteEntity(
  entityType: string,
  entityId: number
): Promise<void> {
  await client.delete(`/recycled/${entityType}/${entityId}/permanent`)
}
