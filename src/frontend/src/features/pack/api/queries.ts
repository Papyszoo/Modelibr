import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '../../../lib/react-query'
import { getAllPacks } from './packApi'

// --- Packs ---

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
