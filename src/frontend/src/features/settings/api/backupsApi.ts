import { baseURL, client } from '@/lib/apiBase'

export interface BackupSummary {
  fileName: string
  sizeBytes: number
  createdAtUtc: string
  status: 'in_progress' | 'ready' | 'failed'
  hostPath: string
  containerPath: string
  includesThumbnails: boolean
  error: string | null
}

export interface BackupStorageInfo {
  hostPath: string
  containerPath: string
  totalUsedBytes: number
}

export interface BackupSizeEstimate {
  databaseBytes: number
  uploadsBytes: number
  thumbnailsBytes: number
}

export async function listBackups(): Promise<{ backups: BackupSummary[] }> {
  const response = await client.get('/backups')
  return response.data
}

export async function getBackupStorageInfo(): Promise<BackupStorageInfo> {
  const response = await client.get('/backups/storage')
  return response.data
}

export async function getBackupSizeEstimate(): Promise<BackupSizeEstimate> {
  const response = await client.get('/backups/estimate')
  return response.data
}

export async function createBackup(
  includeThumbnails: boolean
): Promise<BackupSummary> {
  const response = await client.post('/backups', { includeThumbnails })
  return response.data
}

export async function deleteBackup(fileName: string): Promise<void> {
  await client.delete(`/backups/${encodeURIComponent(fileName)}`)
}

export async function stageRestore(
  fileName: string
): Promise<{ staged: boolean; message: string }> {
  const response = await client.post(
    `/backups/${encodeURIComponent(fileName)}/restore`
  )
  return response.data
}

export function getBackupDownloadUrl(fileName: string): string {
  const path = `/backups/${encodeURIComponent(fileName)}`
  // baseURL may be relative ("/api") or absolute ("http://...") — match either.
  if (baseURL.startsWith('/')) return `${baseURL}${path}`
  return new URL(path, baseURL).toString()
}
