import { queryOptions } from '@tanstack/react-query'

import {
  getMaterialById,
  getMaterialLibrary,
  type MaterialLibraryResponse,
} from './materialApi'

export function getMaterialByIdQueryOptions(materialId: number) {
  return queryOptions({
    queryKey: ['materials', 'detail', materialId] as const,
    queryFn: () => getMaterialById(materialId),
  })
}

export function getMaterialLibraryQueryOptions(
  options: {
    search?: string
    requiresUvs?: boolean
    categoryIds?: number[]
    page?: number
    pageSize?: number
  } = {}
) {
  return queryOptions<MaterialLibraryResponse>({
    queryKey: ['materials', 'library', options] as const,
    queryFn: () => getMaterialLibrary(options),
  })
}
