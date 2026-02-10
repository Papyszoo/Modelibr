import { client } from '../../../lib/apiBase'
import { useApiCacheStore } from '../../../stores/apiCacheStore'

export async function getAllRecycledFiles(): Promise<{
  models: any[]
  modelVersions: any[]
  files: any[]
  textureSets: any[]
  textures: any[]
  sprites: any[]
}> {
  const response = await client.get('/recycled')
  return response.data
}

export async function restoreEntity(
  entityType: string,
  entityId: number
): Promise<void> {
  await client.post(`/recycled/${entityType}/${entityId}/restore`)

  switch (entityType.toLowerCase()) {
    case 'model':
      useApiCacheStore.getState().invalidateModels()
      useApiCacheStore.getState().invalidateModelById(entityId.toString())
      break
    case 'modelversion':
      useApiCacheStore.getState().invalidateModels()
      break
    case 'textureset':
      useApiCacheStore.getState().invalidateTextureSets()
      useApiCacheStore.getState().invalidateTextureSetById(entityId)
      break
    case 'sprite':
      break
  }
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
