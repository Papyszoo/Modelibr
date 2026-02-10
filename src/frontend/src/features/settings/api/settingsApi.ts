import { client } from '../../../lib/apiBase'
import { useApiCacheStore } from '../../../stores/apiCacheStore'

export async function getSettings(): Promise<{
  maxFileSizeBytes: number
  maxThumbnailSizeBytes: number
  thumbnailFrameCount: number
  thumbnailCameraVerticalAngle: number
  thumbnailWidth: number
  thumbnailHeight: number
  generateThumbnailOnUpload: boolean
  createdAt: string
  updatedAt: string
}> {
  const response = await client.get('/settings')
  return response.data
}

export async function updateSettings(settings: {
  maxFileSizeBytes: number
  maxThumbnailSizeBytes: number
  thumbnailFrameCount: number
  thumbnailCameraVerticalAngle: number
  thumbnailWidth: number
  thumbnailHeight: number
  generateThumbnailOnUpload: boolean
}): Promise<{
  maxFileSizeBytes: number
  maxThumbnailSizeBytes: number
  thumbnailFrameCount: number
  thumbnailCameraVerticalAngle: number
  thumbnailWidth: number
  thumbnailHeight: number
  generateThumbnailOnUpload: boolean
  updatedAt: string
}> {
  const response = await client.put('/settings', settings)
  return response.data
}

export function refreshCache(type?: 'models' | 'textureSets' | 'packs'): void {
  const store = useApiCacheStore.getState()
  if (!type) {
    store.invalidateAll()
  } else if (type === 'models') {
    store.refreshModels()
  } else if (type === 'textureSets') {
    store.refreshTextureSets()
  } else if (type === 'packs') {
    store.refreshPacks()
  }
}
