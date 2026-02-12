import { client, UPLOAD_TIMEOUT } from '@/lib/apiBase'
import { SpriteDto } from '@/types'

export async function getAllSprites(): Promise<{
  sprites: Array<{
    id: number
    name: string
    fileId: number
    spriteType: number
    categoryId: number | null
    categoryName: string | null
    fileName: string
    fileSizeBytes: number
    createdAt: string
    updatedAt: string
  }>
}> {
  const response = await client.get('/sprites')
  return response.data
}

export async function getSpritesPaginated(options: {
  page: number
  pageSize: number
  packId?: number
  projectId?: number
  categoryId?: number
}): Promise<{
  sprites: SpriteDto[]
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

  const response = await client.get(`/sprites?${params.toString()}`)
  return response.data
}

export async function getSpriteById(id: number): Promise<{
  id: number
  name: string
  fileId: number
  spriteType: number
  categoryId: number | null
  categoryName: string | null
  fileName: string
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
}> {
  const response = await client.get(`/sprites/${id}`)
  return response.data
}

export async function createSpriteWithFile(
  file: File,
  options?: {
    name?: string
    spriteType?: number
    categoryId?: number
    batchId?: string
    packId?: number
    projectId?: number
  }
): Promise<{
  spriteId: number
  name: string
  fileId: number
  spriteType: number
  fileSizeBytes: number
}> {
  const formData = new FormData()
  formData.append('file', file)

  const params = new URLSearchParams()
  if (options?.name) params.append('name', options.name)
  if (options?.spriteType !== undefined)
    params.append('spriteType', options.spriteType.toString())
  if (options?.categoryId !== undefined)
    params.append('categoryId', options.categoryId.toString())
  if (options?.batchId) params.append('batchId', options.batchId)
  if (options?.packId !== undefined)
    params.append('packId', options.packId.toString())
  if (options?.projectId !== undefined)
    params.append('projectId', options.projectId.toString())

  const response = await client.post(
    `/sprites/with-file?${params.toString()}`,
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

export async function updateSprite(
  id: number,
  updates: {
    name?: string
    spriteType?: number
    categoryId?: number | null
  }
): Promise<{
  id: number
  name: string
  spriteType: number
  categoryId: number | null
}> {
  const response = await client.put(`/sprites/${id}`, updates)
  return response.data
}

export async function softDeleteSprite(spriteId: number): Promise<void> {
  await client.delete(`/sprites/${spriteId}/soft`)
}

// Sprite Category methods

export async function getAllSpriteCategories(): Promise<{
  categories: Array<{
    id: number
    name: string
    description: string | null
    createdAt: string
    updatedAt: string
  }>
}> {
  const response = await client.get('/sprite-categories')
  return response.data
}

export async function createSpriteCategory(
  name: string,
  description?: string
): Promise<{
  id: number
  name: string
  description: string | null
}> {
  const response = await client.post('/sprite-categories', {
    name,
    description,
  })
  return response.data
}

export async function updateSpriteCategory(
  id: number,
  name: string,
  description?: string
): Promise<{
  id: number
  name: string
  description: string | null
}> {
  const response = await client.put(`/sprite-categories/${id}`, {
    name,
    description,
  })
  return response.data
}

export async function deleteSpriteCategory(id: number): Promise<void> {
  await client.delete(`/sprite-categories/${id}`)
}
