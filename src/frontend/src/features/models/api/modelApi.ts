import { AxiosResponse } from 'axios'
import { client, baseURL, UPLOAD_TIMEOUT } from '@/lib/apiBase'
import { Model } from '@/utils/fileUtils'
import { PaginatedResponse } from '@/types'

export interface UploadModelResponse {
  id: number
  alreadyExists: boolean
}

export async function uploadModel(
  file: File,
  options: { batchId?: string } = {}
): Promise<UploadModelResponse> {
  const formData = new FormData()
  formData.append('file', file)

  let url = '/models'
  const params = new URLSearchParams()
  if (options.batchId) {
    params.append('batchId', options.batchId)
  }
  if (params.toString()) {
    url += `?${params.toString()}`
  }

  const response: AxiosResponse<UploadModelResponse> = await client.post(
    url,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: UPLOAD_TIMEOUT,
    }
  )
  return response.data
}

export async function uploadFile(
  file: File,
  options: {
    batchId?: string
    uploadType?: string
    packId?: number
    modelId?: number
    textureSetId?: number
  } = {}
): Promise<{ fileId: number; alreadyExists: boolean }> {
  const formData = new FormData()
  formData.append('file', file)

  let url = '/files'
  const params = new URLSearchParams()
  if (options.batchId) {
    params.append('batchId', options.batchId)
  }
  if (options.uploadType) {
    params.append('uploadType', options.uploadType)
  }
  if (options.packId) {
    params.append('packId', options.packId.toString())
  }
  if (options.modelId) {
    params.append('modelId', options.modelId.toString())
  }
  if (options.textureSetId) {
    params.append('textureSetId', options.textureSetId.toString())
  }
  if (params.toString()) {
    url += `?${params.toString()}`
  }

  const response: AxiosResponse<{ fileId: number; alreadyExists: boolean }> =
    await client.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: UPLOAD_TIMEOUT,
    })

  return response.data
}

export async function getModels(
  options: { skipCache?: boolean; packId?: number; projectId?: number } = {}
): Promise<Model[]> {
  void options

  let url = '/models'
  const params = new URLSearchParams()
  if (options.packId !== undefined) {
    params.append('packId', options.packId.toString())
  }
  if (options.projectId !== undefined) {
    params.append('projectId', options.projectId.toString())
  }
  if (params.toString()) {
    url += `?${params.toString()}`
  }

  const response: AxiosResponse<Model[]> = await client.get(url)
  return response.data
}

export async function getModelsPaginated(options: {
  page: number
  pageSize: number
  packId?: number
  projectId?: number
  textureSetId?: number
}): Promise<PaginatedResponse<Model>> {
  const params = new URLSearchParams()
  params.append('page', options.page.toString())
  params.append('pageSize', options.pageSize.toString())
  if (options.packId) params.append('packId', options.packId.toString())
  if (options.projectId)
    params.append('projectId', options.projectId.toString())
  if (options.textureSetId)
    params.append('textureSetId', options.textureSetId.toString())

  const response = await client.get<PaginatedResponse<Model>>(
    `/models?${params.toString()}`
  )
  return response.data
}

export async function getModelById(
  modelId: string,
  options: { skipCache?: boolean } = {}
): Promise<Model> {
  void options
  const response: AxiosResponse<Model> = await client.get(`/models/${modelId}`)
  return response.data
}

export function getModelFileUrl(modelId: string): string {
  return `${baseURL}/models/${modelId}/file`
}

export function getFileUrl(fileId: string): string {
  return `${baseURL}/files/${fileId}`
}

export function getFilePreviewUrl(fileId: string, channel?: string): string {
  const ch = channel || 'rgb'
  return `${baseURL}/files/${fileId}/preview?channel=${ch}`
}

export async function updateModelTags(
  modelId: string,
  tags: string,
  description: string
): Promise<{
  modelId: number
  tags: string
  description: string
}> {
  const response = await client.post(`/models/${modelId}/tags`, {
    tags,
    description,
  })
  return response.data
}

export async function softDeleteModel(modelId: number): Promise<void> {
  await client.delete(`/models/${modelId}`)
}

export async function softDeleteFile(fileId: number): Promise<void> {
  await client.delete(`/files/${fileId}`)
}

export async function setDefaultTextureSet(
  modelId: number,
  textureSetId: number | null,
  modelVersionId?: number
): Promise<{ modelId: number; defaultTextureSetId: number | null }> {
  const response = await client.put(`/models/${modelId}/default-texture-set`, {
    TextureSetId: textureSetId,
    ModelVersionId: modelVersionId,
  })
  return response.data
}
