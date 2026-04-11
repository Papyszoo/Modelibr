import { client } from '@/lib/apiBase'
import {
  type EnvironmentMapCategoryDto,
  type GetAllEnvironmentMapCategoriesResponse,
  type UpsertEnvironmentMapCategoryRequest,
} from '@/types'

export async function getEnvironmentMapCategories(): Promise<
  EnvironmentMapCategoryDto[]
> {
  const response = await client.get<GetAllEnvironmentMapCategoriesResponse>(
    '/environment-map-categories'
  )
  return response.data.categories
}

export async function createEnvironmentMapCategory(
  request: UpsertEnvironmentMapCategoryRequest
): Promise<EnvironmentMapCategoryDto> {
  const response = await client.post<EnvironmentMapCategoryDto>(
    '/environment-map-categories',
    request
  )
  return response.data
}

export async function updateEnvironmentMapCategory(
  id: number,
  request: UpsertEnvironmentMapCategoryRequest
): Promise<void> {
  await client.put(`/environment-map-categories/${id}`, request)
}

export async function deleteEnvironmentMapCategory(id: number): Promise<void> {
  await client.delete(`/environment-map-categories/${id}`)
}
