import { ApiClientError, client } from '@/lib/apiBase'

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
  duplicateNamePolicy: string
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
}): Promise<{
  maxFileSizeBytes: number
  maxThumbnailSizeBytes: number
  thumbnailFrameCount: number
  thumbnailCameraVerticalAngle: number
  thumbnailWidth: number
  thumbnailHeight: number
  generateThumbnailOnUpload: boolean
  textureProxySize: number
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

// ── WebDAV URL Discovery & Probe ──────────────────────────────────────

export interface WebDavUrlEntry {
  url: string
  label: string
  isHttps: boolean
  /** Port number string matching the WEBDAV_HTTPS_PORT / WEBDAV_HTTP_PORT env var value, e.g. "443" or "80" */
  port: string
}

export async function getWebDavUrls(): Promise<{ urls: WebDavUrlEntry[] }> {
  const response = await client.get('/settings/webdav/urls')
  return response.data
}

export async function probeWebDavUrl(
  url: string
): Promise<{ reachable: boolean; folderCount: number; error?: string }> {
  const response = await client.get('/settings/webdav/probe', {
    params: { url },
  })
  return response.data
}

export interface NativeRuntimeSettings {
  appPort: number
  internalApiPort: number
  postgresPort: number
  workerProcessCount: number
  maxConcurrentJobsPerWorker: number
  enableHardwareAcceleration: boolean
  webApiHealthUrl: string
  publicAppUrl: string
  publicWebDavUrl: string
  dataDirectory: string
  workerHealthUrls: string[]
}

export interface NativeRuntimeUpdateResult {
  restartRequired: boolean
  config: NativeRuntimeSettings
}

export async function getNativeRuntimeSettings(): Promise<NativeRuntimeSettings | null> {
  try {
    const response = await client.get('/native/runtime')
    return response.data
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return null
    }

    throw error
  }
}

export async function updateNativeRuntimeSettings(settings: {
  appPort: number
  workerProcessCount: number
  maxConcurrentJobsPerWorker: number
  enableHardwareAcceleration: boolean
}): Promise<NativeRuntimeUpdateResult> {
  const response = await client.put('/native/runtime', settings)
  return response.data
}

export async function updateSetting(
  key: string,
  value: string
): Promise<{ key: string; value: string; updatedAt: string }> {
  const response = await client.put(`/settings/${encodeURIComponent(key)}`, {
    value,
  })
  return response.data
}
