import { client, UPLOAD_TIMEOUT } from '@/lib/apiBase'
import { Model } from '@/utils/fileUtils'
import {
  PackDto,
  GetAllPacksResponse,
  CreatePackRequest,
  CreatePackResponse,
  UpdatePackRequest,
  TextureSetDto,
  GetAllTextureSetsResponse,
  SpriteDto,
  GetAllSpritesResponse,
  SoundDto,
  GetAllSoundsResponse,
} from '../../../types'

export async function getAllPacks(
  options: { skipCache?: boolean } = {}
): Promise<PackDto[]> {
  void options
  const response = await client.get<GetAllPacksResponse>('/packs')
  return response.data.packs
}

export async function getPackById(
  id: number,
  options: { skipCache?: boolean } = {}
): Promise<PackDto> {
  void options
  const response = await client.get<PackDto>(`/packs/${id}`)
  return response.data
}

export async function createPack(
  request: CreatePackRequest
): Promise<CreatePackResponse> {
  const response = await client.post<CreatePackResponse>('/packs', request)
  return response.data
}

export async function updatePack(
  id: number,
  request: UpdatePackRequest
): Promise<void> {
  await client.put(`/packs/${id}`, request)
}

export async function deletePack(id: number): Promise<void> {
  await client.delete(`/packs/${id}`)
}

export async function addModelToPack(
  packId: number,
  modelId: number
): Promise<void> {
  await client.post(`/packs/${packId}/models/${modelId}`)
}

export async function removeModelFromPack(
  packId: number,
  modelId: number
): Promise<void> {
  await client.delete(`/packs/${packId}/models/${modelId}`)
}

export async function addTextureSetToPack(
  packId: number,
  textureSetId: number
): Promise<void> {
  await client.post(`/packs/${packId}/texture-sets/${textureSetId}`)
}

export async function addTextureToPackWithFile(
  packId: number,
  file: File,
  name: string,
  textureType: number,
  batchId?: string
): Promise<{ textureSetId: number }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', name)
  formData.append('textureType', textureType.toString())

  const params = new URLSearchParams()
  if (batchId) {
    params.append('batchId', batchId)
  }
  params.append('uploadType', 'pack')

  const response = await client.post<{ textureSetId: number }>(
    `/packs/${packId}/textures/with-file?${params.toString()}`,
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

export async function removeTextureSetFromPack(
  packId: number,
  textureSetId: number
): Promise<void> {
  await client.delete(`/packs/${packId}/texture-sets/${textureSetId}`)
}

export async function getModelsByPack(packId: number): Promise<Model[]> {
  const response = await client.get<Model[]>(`/models?packId=${packId}`)
  return response.data
}

export async function getTextureSetsByPack(
  packId: number
): Promise<TextureSetDto[]> {
  const response = await client.get<GetAllTextureSetsResponse>(
    `/texture-sets?packId=${packId}`
  )
  return response.data.textureSets
}

export async function addSpriteToPack(
  packId: number,
  spriteId: number
): Promise<void> {
  await client.post(`/packs/${packId}/sprites/${spriteId}`)
}

export async function removeSpriteFromPack(
  packId: number,
  spriteId: number
): Promise<void> {
  await client.delete(`/packs/${packId}/sprites/${spriteId}`)
}

export async function getSpritesByPack(packId: number): Promise<SpriteDto[]> {
  const response = await client.get<GetAllSpritesResponse>(
    `/sprites?packId=${packId}`
  )
  return response.data.sprites
}

export async function addSoundToPack(
  packId: number,
  soundId: number
): Promise<void> {
  await client.post(`/packs/${packId}/sounds/${soundId}`)
}

export async function removeSoundFromPack(
  packId: number,
  soundId: number
): Promise<void> {
  await client.delete(`/packs/${packId}/sounds/${soundId}`)
}

export async function getSoundsByPack(packId: number): Promise<SoundDto[]> {
  const response = await client.get<GetAllSoundsResponse>(
    `/sounds?packId=${packId}`
  )
  return response.data.sounds
}
