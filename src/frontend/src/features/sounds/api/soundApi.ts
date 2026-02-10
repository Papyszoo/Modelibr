import { client, UPLOAD_TIMEOUT } from '../../../lib/apiBase'
import {
  SoundDto,
  GetAllSoundsResponse,
  GetAllSoundCategoriesResponse,
} from '../../../types'

export async function getAllSounds(options?: {
  packId?: number
  projectId?: number
  categoryId?: number
}): Promise<GetAllSoundsResponse> {
  const params = new URLSearchParams()
  if (options?.packId) params.append('packId', options.packId.toString())
  if (options?.projectId)
    params.append('projectId', options.projectId.toString())
  if (options?.categoryId)
    params.append('categoryId', options.categoryId.toString())

  const url = params.toString() ? `/sounds?${params.toString()}` : '/sounds'
  const response = await client.get<GetAllSoundsResponse>(url)
  return response.data
}

export async function getSoundsPaginated(options: {
  page: number
  pageSize: number
  packId?: number
  projectId?: number
  categoryId?: number
}): Promise<{
  sounds: SoundDto[]
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
  if (options.categoryId)
    params.append('categoryId', options.categoryId.toString())

  const response = await client.get(`/sounds?${params.toString()}`)
  return response.data
}

export async function getSoundById(id: number): Promise<SoundDto> {
  const response = await client.get<SoundDto>(`/sounds/${id}`)
  return response.data
}

export async function createSoundWithFile(
  file: File,
  options?: {
    name?: string
    duration?: number
    peaks?: string
    categoryId?: number
    batchId?: string
    packId?: number
    projectId?: number
  }
): Promise<{
  soundId: number
  name: string
  fileId: number
  duration: number
  fileSizeBytes: number
}> {
  const formData = new FormData()
  formData.append('file', file)

  const params = new URLSearchParams()
  if (options?.name) params.append('name', options.name)
  if (options?.duration !== undefined)
    params.append('duration', options.duration.toString())
  if (options?.peaks) params.append('peaks', options.peaks)
  if (options?.categoryId)
    params.append('categoryId', options.categoryId.toString())
  if (options?.batchId) params.append('batchId', options.batchId)
  if (options?.packId) params.append('packId', options.packId.toString())
  if (options?.projectId)
    params.append('projectId', options.projectId.toString())

  const response = await client.post(
    `/sounds/with-file?${params.toString()}`,
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

export async function updateSound(
  id: number,
  updates: {
    name?: string
    categoryId?: number | null
  }
): Promise<{
  id: number
  name: string
}> {
  const response = await client.put(`/sounds/${id}`, updates)
  return response.data
}

export async function deleteSound(id: number): Promise<void> {
  await client.delete(`/sounds/${id}`)
}

export async function softDeleteSound(id: number): Promise<void> {
  await client.delete(`/sounds/${id}/soft`)
}

// Sound Category methods

export async function getAllSoundCategories(): Promise<GetAllSoundCategoriesResponse> {
  const response =
    await client.get<GetAllSoundCategoriesResponse>('/sound-categories')
  return response.data
}

export async function createSoundCategory(
  name: string,
  description?: string
): Promise<{ id: number; name: string }> {
  const response = await client.post('/sound-categories', {
    name,
    description,
  })
  return response.data
}

export async function updateSoundCategory(
  id: number,
  name: string,
  description?: string
): Promise<{ id: number; name: string }> {
  const response = await client.put(`/sound-categories/${id}`, {
    name,
    description,
  })
  return response.data
}

export async function deleteSoundCategory(id: number): Promise<void> {
  await client.delete(`/sound-categories/${id}`)
}
