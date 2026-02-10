import { AxiosResponse } from 'axios'
import { client, baseURL } from '../../../lib/apiBase'
import { useApiCacheStore } from '../../../stores/apiCacheStore'

export interface ThumbnailStatus {
  status: 'Pending' | 'Processing' | 'Ready' | 'Failed'
  fileUrl?: string
  sizeBytes?: number
  width?: number
  height?: number
  errorMessage?: string
  createdAt?: string
  processedAt?: string
}

export async function getThumbnailStatus(
  modelId: string,
  options: { skipCache?: boolean } = {}
): Promise<ThumbnailStatus> {
  if (!options.skipCache) {
    const cached = useApiCacheStore.getState().getThumbnailStatus(modelId)
    if (cached) {
      return cached
    }
  }

  const response: AxiosResponse<ThumbnailStatus> = await client.get(
    `/models/${modelId}/thumbnail`
  )

  useApiCacheStore.getState().setThumbnailStatus(modelId, response.data)

  return response.data
}

export async function getVersionThumbnailStatus(
  versionId: number,
  _options: { skipCache?: boolean } = {}
): Promise<ThumbnailStatus> {
  const response: AxiosResponse<ThumbnailStatus> = await client.get(
    `/model-versions/${versionId}/thumbnail`
  )
  return response.data
}

export function getThumbnailUrl(modelId: string): string {
  return `${baseURL}/models/${modelId}/thumbnail/file`
}

export function getVersionThumbnailUrl(versionId: number): string {
  return `${baseURL}/model-versions/${versionId}/thumbnail/file`
}

export function getWaveformUrl(soundId: string): string {
  return `${baseURL}/sounds/${soundId}/waveform`
}

export async function getThumbnailFile(
  modelId: string,
  options: { skipCache?: boolean } = {}
): Promise<Blob> {
  if (!options.skipCache) {
    const cached = useApiCacheStore.getState().getThumbnailBlob(modelId)
    if (cached) {
      return cached
    }
  }

  const response: AxiosResponse<Blob> = await client.get(
    `/models/${modelId}/thumbnail/file`,
    { responseType: 'blob' }
  )

  useApiCacheStore.getState().setThumbnailBlob(modelId, response.data)

  return response.data
}

export async function regenerateThumbnail(
  modelId: string,
  versionId?: number
): Promise<void> {
  const url = versionId
    ? `/models/${modelId}/thumbnail/regenerate?versionId=${versionId}`
    : `/models/${modelId}/thumbnail/regenerate`

  const response: AxiosResponse<void> = await client.post(url)

  useApiCacheStore.getState().invalidateThumbnailById(modelId)

  return response.data
}
