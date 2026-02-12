import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '@/lib/react-query'
import { getModelsPaginated, getModelById } from './modelApi'
import { getAllPacks } from '@/features/pack/api/packApi'
import { getAllProjects } from '@/features/project/api/projectApi'

// --- Models (paginated) ---

export function getModelsQueryOptions(params: {
  page: number
  pageSize: number
  packId?: number
  projectId?: number
  textureSetId?: number
}) {
  return queryOptions({
    queryKey: ['models', params] as const,
    queryFn: () => getModelsPaginated(params),
  })
}

type UseModelsQueryOptions = {
  params: {
    page: number
    pageSize: number
    packId?: number
    projectId?: number
    textureSetId?: number
  }
  queryConfig?: QueryConfig<typeof getModelsQueryOptions>
}

export function useModelsQuery({
  params,
  queryConfig = {},
}: UseModelsQueryOptions) {
  return useQuery({
    ...getModelsQueryOptions(params),
    ...queryConfig,
  })
}

// --- Single Model ---

export function getModelByIdQueryOptions(modelId: string) {
  return queryOptions({
    queryKey: ['models', 'detail', modelId] as const,
    queryFn: () => getModelById(modelId, { skipCache: true }),
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

// --- Packs (for filter dropdowns) ---

export function getPacksQueryOptions() {
  return queryOptions({
    queryKey: ['packs'] as const,
    queryFn: () => getAllPacks({ skipCache: true }),
  })
}

type UsePacksQueryOptions = {
  queryConfig?: QueryConfig<typeof getPacksQueryOptions>
}

export function usePacksQuery({ queryConfig = {} }: UsePacksQueryOptions = {}) {
  return useQuery({
    ...getPacksQueryOptions(),
    ...queryConfig,
  })
}

// --- Projects (for filter dropdowns) ---

export function getProjectsQueryOptions() {
  return queryOptions({
    queryKey: ['projects'] as const,
    queryFn: () => getAllProjects({ skipCache: true }),
  })
}

type UseProjectsQueryOptions = {
  queryConfig?: QueryConfig<typeof getProjectsQueryOptions>
}

export function useProjectsQuery({
  queryConfig = {},
}: UseProjectsQueryOptions = {}) {
  return useQuery({
    ...getProjectsQueryOptions(),
    ...queryConfig,
  })
}
