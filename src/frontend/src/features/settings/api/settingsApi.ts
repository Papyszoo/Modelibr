import { client } from '@/lib/apiBase'

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
  // Legacy apiCacheStore hook removed. React Query is now responsible for caching.
  // This function is kept (no-op) to avoid breaking imports if any appear later.
  void type
}
