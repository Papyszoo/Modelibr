import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '@/lib/react-query'
import { getModelVersions } from './modelVersionApi'
import { getModelById } from '@/features/models/api/modelApi'

export function getModelVersionsQueryOptions(modelId: number) {
  return queryOptions({
    queryKey: ['modelVersions', modelId] as const,
    queryFn: () => getModelVersions(modelId),
  })
}

export function getModelVersionsSkipCacheQueryOptions(modelId: number) {
  return queryOptions({
    queryKey: ['modelVersions', modelId, 'skipCache'] as const,
    queryFn: () => getModelVersions(modelId, { skipCache: true }),
  })
}

export function getModelByIdQueryOptions(modelId: string) {
  return queryOptions({
    queryKey: ['models', 'detail', modelId] as const,
    queryFn: () => getModelById(modelId, { skipCache: true }),
  })
}

type UseModelVersionsQueryOptions = {
  modelId: number
  queryConfig?: QueryConfig<typeof getModelVersionsQueryOptions>
}

export function useModelVersionsQuery({
  modelId,
  queryConfig = {},
}: UseModelVersionsQueryOptions) {
  return useQuery({
    ...getModelVersionsQueryOptions(modelId),
    ...queryConfig,
  })
}

type UseModelByIdQueryOptions = {
  modelId: string
  queryConfig?: QueryConfig<typeof getModelByIdQueryOptions>
}

export function useModelByIdQuery({
  modelId,
  queryConfig = {},
}: UseModelByIdQueryOptions) {
  return useQuery({
    ...getModelByIdQueryOptions(modelId),
    ...queryConfig,
  })
}
