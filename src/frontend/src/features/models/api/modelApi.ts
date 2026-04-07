import { type AxiosResponse } from 'axios'

import { baseURL, client, UPLOAD_TIMEOUT } from '@/lib/apiBase'
import { type PaginatedResponse } from '@/types'
import {
  type GetAllModelCategoriesResponse,
  type GetAllModelTagsResponse,
  type ModelCategoryDto,
  type ModelTagDto,
  type UpsertModelCategoryRequest,
} from '@/types'
import { type Model } from '@/utils/fileUtils'

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
  categoryIds?: number[]
  tags?: string[]
  hasConceptImages?: boolean
}): Promise<PaginatedResponse<Model>> {
  const params = new URLSearchParams()
  params.append('page', options.page.toString())
  params.append('pageSize', options.pageSize.toString())
  if (options.packId) params.append('packId', options.packId.toString())
  if (options.projectId)
    params.append('projectId', options.projectId.toString())
  if (options.textureSetId)
    params.append('textureSetId', options.textureSetId.toString())
  for (const categoryId of options.categoryIds ?? []) {
    params.append('categoryId', categoryId.toString())
  }
  for (const tag of options.tags ?? []) {
    params.append('tag', tag)
  }
  if (typeof options.hasConceptImages === 'boolean') {
    params.append('hasConceptImages', String(options.hasConceptImages))
  }

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
  tags: string[],
  description: string,
  categoryId?: number | null
): Promise<{
  modelId: number
  tags: string[]
  description: string
  categoryId?: number | null
}> {
  const response = await client.post(`/models/${modelId}/tags`, {
    tags,
    description,
    categoryId,
  })
  return response.data
}

export async function getModelCategories(): Promise<ModelCategoryDto[]> {
  const response =
    await client.get<GetAllModelCategoriesResponse>('/model-categories')
  return response.data.categories
}

export async function getModelTags(): Promise<ModelTagDto[]> {
  const response = await client.get<GetAllModelTagsResponse>('/model-tags')
  return response.data.tags
}

export async function createModelCategory(
  request: UpsertModelCategoryRequest
): Promise<ModelCategoryDto> {
  const response = await client.post<ModelCategoryDto>(
    '/model-categories',
    request
  )
  return response.data
}

export async function updateModelCategory(
  id: number,
  request: UpsertModelCategoryRequest
): Promise<void> {
  await client.put(`/model-categories/${id}`, request)
}

export async function deleteModelCategory(id: number): Promise<void> {
  await client.delete(`/model-categories/${id}`)
}

export async function addModelConceptImage(
  modelId: string | number,
  fileId: number
): Promise<void> {
  await client.post(`/models/${modelId}/concept-images`, { fileId })
}

export async function removeModelConceptImage(
  modelId: string | number,
  fileId: number
): Promise<void> {
  await client.delete(`/models/${modelId}/concept-images/${fileId}`)
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
