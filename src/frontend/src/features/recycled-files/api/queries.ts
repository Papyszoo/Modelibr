import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '@/lib/react-query'
import { getAllRecycledFiles } from './recycledApi'

// --- Recycled Files ---

export function getRecycledFilesQueryOptions() {
  return queryOptions({
    queryKey: ['recycledFiles'] as const,
    queryFn: () => getAllRecycledFiles(),
  })
}

type UseRecycledFilesQueryOptions = {
  queryConfig?: QueryConfig<typeof getRecycledFilesQueryOptions>
}

export function useRecycledFilesQuery({
  queryConfig = {},
}: UseRecycledFilesQueryOptions = {}) {
  return useQuery({
    ...getRecycledFilesQueryOptions(),
    ...queryConfig,
  })
}
