import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '@/lib/react-query'
import { getAllStages, getStageById } from './stageApi'

export function getStagesQueryOptions() {
  return queryOptions({
    queryKey: ['stages'] as const,
    queryFn: () => getAllStages(),
  })
}

type UseStagesQueryOptions = {
  queryConfig?: QueryConfig<typeof getStagesQueryOptions>
}

export function useStagesQuery({
  queryConfig = {},
}: UseStagesQueryOptions = {}) {
  return useQuery({
    ...getStagesQueryOptions(),
    ...queryConfig,
  })
}

export function getStageByIdQueryOptions(stageId: number) {
  return queryOptions({
    queryKey: ['stages', 'detail', stageId] as const,
    queryFn: () => getStageById(stageId),
  })
}

type UseStageByIdQueryOptions = {
  stageId: number
  queryConfig?: QueryConfig<typeof getStageByIdQueryOptions>
}

export function useStageByIdQuery({
  stageId,
  queryConfig = {},
}: UseStageByIdQueryOptions) {
  return useQuery({
    ...getStageByIdQueryOptions(stageId),
    ...queryConfig,
  })
}
