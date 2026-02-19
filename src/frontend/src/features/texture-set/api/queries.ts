import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '@/lib/react-query'
import {
  getTextureSetsPaginated,
  getAllTextureSets,
  getTextureSetById,
} from './textureSetApi'

export function getTextureSetsQueryOptions(params: {
  page: number
  pageSize: number
  kind?: number
}) {
  return queryOptions({
    queryKey: ['textureSets', params] as const,
    queryFn: () => getTextureSetsPaginated(params),
  })
}

export function getAllTextureSetsQueryOptions() {
  return queryOptions({
    queryKey: ['textureSets', 'all'] as const,
    queryFn: () => getAllTextureSets(),
  })
}

export function getTextureSetByIdQueryOptions(textureSetId: number) {
  return queryOptions({
    queryKey: ['textureSets', 'detail', textureSetId] as const,
    queryFn: () => getTextureSetById(textureSetId),
  })
}

export function getTextureSetsByModelVersionQueryOptions(
  modelVersionId: number
) {
  return queryOptions({
    queryKey: ['textureSets', 'modelVersion', modelVersionId] as const,
    queryFn: async () => {
      const allTextureSets = await getAllTextureSets()
      return allTextureSets.filter(ts =>
        ts.associatedModels.some(m => m.modelVersionId === modelVersionId)
      )
    },
  })
}

type UseTextureSetsQueryOptions = {
  params: { page: number; pageSize: number }
  queryConfig?: QueryConfig<typeof getTextureSetsQueryOptions>
}

export function useTextureSetsQuery({
  params,
  queryConfig = {},
}: UseTextureSetsQueryOptions) {
  return useQuery({
    ...getTextureSetsQueryOptions(params),
    ...queryConfig,
  })
}

type UseAllTextureSetsQueryOptions = {
  queryConfig?: QueryConfig<typeof getAllTextureSetsQueryOptions>
}

export function useAllTextureSetsQuery({
  queryConfig = {},
}: UseAllTextureSetsQueryOptions = {}) {
  return useQuery({
    ...getAllTextureSetsQueryOptions(),
    ...queryConfig,
  })
}

type UseTextureSetByIdQueryOptions = {
  textureSetId: number
  queryConfig?: QueryConfig<typeof getTextureSetByIdQueryOptions>
}

export function useTextureSetByIdQuery({
  textureSetId,
  queryConfig = {},
}: UseTextureSetByIdQueryOptions) {
  return useQuery({
    ...getTextureSetByIdQueryOptions(textureSetId),
    ...queryConfig,
  })
}

type UseTextureSetsByModelVersionQueryOptions = {
  modelVersionId: number
  queryConfig?: QueryConfig<typeof getTextureSetsByModelVersionQueryOptions>
}

export function useTextureSetsByModelVersionQuery({
  modelVersionId,
  queryConfig = {},
}: UseTextureSetsByModelVersionQueryOptions) {
  return useQuery({
    ...getTextureSetsByModelVersionQueryOptions(modelVersionId),
    ...queryConfig,
  })
}
