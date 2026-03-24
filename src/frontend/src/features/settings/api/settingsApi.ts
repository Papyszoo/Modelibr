import { client } from '@/lib/apiBase'

export async function getSettings(): Promise<{
  maxFileSizeBytes: number
  maxThumbnailSizeBytes: number
  thumbnailFrameCount: number
  thumbnailCameraVerticalAngle: number
  thumbnailWidth: number
  thumbnailHeight: number
  generateThumbnailOnUpload: boolean
  textureProxySize: number
  blenderPath: string
  blenderEnabled: boolean
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
  textureProxySize: number
  blenderPath: string
}): Promise<{
  maxFileSizeBytes: number
  maxThumbnailSizeBytes: number
  thumbnailFrameCount: number
  thumbnailCameraVerticalAngle: number
  thumbnailWidth: number
  thumbnailHeight: number
  generateThumbnailOnUpload: boolean
  textureProxySize: number
  blenderPath: string
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

// ── Blender Installation Management ───────────────────────────────────

export interface BlenderVersionInfo {
  version: string
  label: string
  isLts: boolean
}

export interface BlenderInstallStatus {
  state: string
  installedVersion: string | null
  installedPath: string | null
  progress: number
  downloadedBytes: number | null
  totalBytes: number | null
  error: string | null
}

export async function getBlenderVersions(): Promise<{
  versions: BlenderVersionInfo[]
  isOffline: boolean
}> {
  const response = await client.get('/settings/blender/versions')
  return response.data
}

export async function getBlenderStatus(): Promise<BlenderInstallStatus> {
  const response = await client.get('/settings/blender/status')
  return response.data
}

export async function installBlender(
  version: string
): Promise<BlenderInstallStatus> {
  const response = await client.post('/settings/blender/install', { version })
  return response.data
}

export async function uninstallBlender(): Promise<BlenderInstallStatus> {
  const response = await client.post('/settings/blender/uninstall')
  return response.data
}
