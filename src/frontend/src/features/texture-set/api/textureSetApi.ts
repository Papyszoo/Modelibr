import { AxiosResponse } from 'axios'
import { client, UPLOAD_TIMEOUT } from '../../../lib/apiBase'
import { useApiCacheStore } from '../../../stores/apiCacheStore'
import {
  TextureSetDto,
  GetAllTextureSetsResponse,
  CreateTextureSetRequest,
  CreateTextureSetResponse,
  UpdateTextureSetRequest,
  UpdateTextureSetResponse,
  AddTextureToSetRequest,
  AddTextureToSetResponse,
} from '../../../types'

export async function getAllTextureSets(
  options: { skipCache?: boolean } = {}
): Promise<TextureSetDto[]> {
  if (!options.skipCache) {
    const cached = useApiCacheStore.getState().getTextureSets()
    if (cached) {
      return cached
    }
  }

  const response: AxiosResponse<GetAllTextureSetsResponse> =
    await client.get('/texture-sets')

  useApiCacheStore.getState().setTextureSets(response.data.textureSets)

  return response.data.textureSets
}

export async function getTextureSetsPaginated(options: {
  page: number
  pageSize: number
  packId?: number
  projectId?: number
}): Promise<{
  textureSets: TextureSetDto[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}> {
  const params = new URLSearchParams()
  params.append('page', options.page.toString())
  params.append('pageSize', options.pageSize.toString())
  if (options.packId) params.append('packId', options.packId.toString())
  if (options.projectId)
    params.append('projectId', options.projectId.toString())

  const response = await client.get(`/texture-sets?${params.toString()}`)
  return response.data
}

export async function getTextureSetById(
  id: number,
  options: { skipCache?: boolean } = {}
): Promise<TextureSetDto> {
  if (!options.skipCache) {
    const cached = useApiCacheStore.getState().getTextureSetById(id)
    if (cached) {
      return cached
    }
  }

  const response: AxiosResponse<TextureSetDto> = await client.get(
    `/texture-sets/${id}`
  )

  useApiCacheStore.getState().setTextureSetById(id, response.data)

  return response.data
}

export async function getTextureSetByFileId(
  fileId: number
): Promise<{ textureSetId: number | null }> {
  const response: AxiosResponse<{ textureSetId: number | null }> =
    await client.get(`/texture-sets/by-file/${fileId}`)
  return response.data
}

export async function createTextureSet(
  request: CreateTextureSetRequest
): Promise<CreateTextureSetResponse> {
  const response: AxiosResponse<CreateTextureSetResponse> = await client.post(
    '/texture-sets',
    request
  )

  useApiCacheStore.getState().invalidateTextureSets()

  return response.data
}

export async function createTextureSetWithFile(
  file: File,
  options?: { name?: string; textureType?: string; batchId?: string }
): Promise<{
  textureSetId: number
  name: string
  fileId: number
  textureId: number
  textureType: string
}> {
  const formData = new FormData()
  formData.append('file', file)

  const params = new URLSearchParams()
  if (options?.name) params.append('name', options.name)
  if (options?.textureType) params.append('textureType', options.textureType)
  if (options?.batchId) params.append('batchId', options.batchId)

  const response = await client.post(
    `/texture-sets/with-file?${params.toString()}`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: UPLOAD_TIMEOUT,
    }
  )

  useApiCacheStore.getState().invalidateTextureSets()

  return response.data
}

export async function updateTextureSet(
  id: number,
  request: UpdateTextureSetRequest
): Promise<UpdateTextureSetResponse> {
  const response: AxiosResponse<UpdateTextureSetResponse> = await client.put(
    `/texture-sets/${id}`,
    request
  )

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(id)

  return response.data
}

export async function deleteTextureSet(id: number): Promise<void> {
  await client.delete(`/texture-sets/${id}`)

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(id)
}

export async function hardDeleteTextureSet(id: number): Promise<void> {
  await client.delete(`/texture-sets/${id}/hard`)

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(id)
}

export async function addTextureToSetEndpoint(
  setId: number,
  request: AddTextureToSetRequest
): Promise<AddTextureToSetResponse> {
  const response: AxiosResponse<AddTextureToSetResponse> = await client.post(
    `/texture-sets/${setId}/textures`,
    request
  )

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(setId)

  return response.data
}

export async function removeTextureFromSet(
  setId: number,
  textureId: number
): Promise<void> {
  await client.delete(`/texture-sets/${setId}/textures/${textureId}`)

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(setId)
}

export async function changeTextureType(
  setId: number,
  textureId: number,
  newTextureType: number
): Promise<void> {
  await client.put(`/texture-sets/${setId}/textures/${textureId}/type`, {
    textureType: newTextureType,
  })

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(setId)
}

export async function changeTextureChannel(
  setId: number,
  textureId: number,
  sourceChannel: number
): Promise<void> {
  await client.put(`/texture-sets/${setId}/textures/${textureId}/channel`, {
    sourceChannel,
  })

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(setId)
}

export async function associateTextureSetWithModelVersion(
  setId: number,
  modelVersionId: number
): Promise<void> {
  await client.post(`/texture-sets/${setId}/model-versions/${modelVersionId}`)

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(setId)
  useApiCacheStore.getState().invalidateModels()
}

export async function disassociateTextureSetFromModelVersion(
  setId: number,
  modelVersionId: number
): Promise<void> {
  await client.delete(`/texture-sets/${setId}/model-versions/${modelVersionId}`)

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(setId)
  useApiCacheStore.getState().invalidateModels()
}

export async function associateTextureSetWithAllModelVersions(
  setId: number,
  modelId: number
): Promise<void> {
  await client.post(`/texture-sets/${setId}/models/${modelId}/all-versions`)

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(setId)
  useApiCacheStore.getState().invalidateModels()
  useApiCacheStore.getState().invalidateModelById(modelId.toString())
}

export async function softDeleteTextureSet(
  textureSetId: number
): Promise<void> {
  await client.delete(`/texture-sets/${textureSetId}`)

  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(textureSetId)
}
