import { client, baseURL, UPLOAD_TIMEOUT } from '../../../lib/apiBase'
import { useApiCacheStore } from '../../../stores/apiCacheStore'
import { ModelVersionDto, CreateModelVersionResponse } from '../../../types'

export async function getModelVersions(
  modelId: number,
  options: { skipCache?: boolean } = {}
): Promise<ModelVersionDto[]> {
  const url = options.skipCache
    ? `/models/${modelId}/versions?_=${Date.now()}`
    : `/models/${modelId}/versions`

  const response = await client.get<ModelVersionDto[]>(url)
  return response.data
}

export async function getModelVersion(
  modelId: number,
  versionId: number
): Promise<ModelVersionDto> {
  const response = await client.get<ModelVersionDto>(
    `/models/${modelId}/versions/${versionId}`
  )
  return response.data
}

export async function createModelVersion(
  modelId: number,
  file: File,
  description?: string,
  setAsActive: boolean = true
): Promise<CreateModelVersionResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const params = new URLSearchParams()
  if (description) {
    params.append('description', description)
  }
  params.append('setAsActive', setAsActive.toString())

  const url = `/models/${modelId}/versions${params.toString() ? `?${params.toString()}` : ''}`

  const response = await client.post<CreateModelVersionResponse>(
    url,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: UPLOAD_TIMEOUT,
    }
  )

  useApiCacheStore.getState().invalidateModels()
  useApiCacheStore.getState().invalidateModelById(modelId.toString())

  return response.data
}

export async function addFileToVersion(
  modelId: number,
  versionId: number,
  file: File
): Promise<CreateModelVersionResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const url = `/models/${modelId}/versions/${versionId}/files`

  const response = await client.post<CreateModelVersionResponse>(
    url,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: UPLOAD_TIMEOUT,
    }
  )

  useApiCacheStore.getState().invalidateModels()
  useApiCacheStore.getState().invalidateModelById(modelId.toString())

  return response.data
}

export function getVersionFileUrl(
  modelId: number,
  versionId: number,
  fileId: number
): string {
  return `${baseURL}/models/${modelId}/versions/${versionId}/files/${fileId}`
}

export async function setActiveVersion(
  modelId: number,
  versionId: number
): Promise<void> {
  await client.post(`/models/${modelId}/active-version/${versionId}`)

  useApiCacheStore.getState().invalidateModels()
  useApiCacheStore.getState().invalidateModelById(modelId.toString())
}

export async function softDeleteModelVersion(
  modelId: number,
  versionId: number
): Promise<void> {
  await client.delete(`/models/${modelId}/versions/${versionId}`)

  useApiCacheStore.getState().invalidateModelById(modelId.toString())
}
