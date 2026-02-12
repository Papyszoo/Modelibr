import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '@/lib/react-query'
import { getAllProjects } from './projectApi'

// --- Projects ---

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
