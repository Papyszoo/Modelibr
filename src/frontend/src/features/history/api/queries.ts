import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '../../../lib/react-query'
import { getBatchUploadHistory } from './historyApi'

// --- Upload History ---

export function getUploadHistoryQueryOptions() {
  return queryOptions({
    queryKey: ['uploadHistory'] as const,
    queryFn: () => getBatchUploadHistory(),
  })
}

type UseUploadHistoryQueryOptions = {
  queryConfig?: QueryConfig<typeof getUploadHistoryQueryOptions>
}

export function useUploadHistoryQuery({
  queryConfig = {},
}: UseUploadHistoryQueryOptions = {}) {
  return useQuery({
    ...getUploadHistoryQueryOptions(),
    ...queryConfig,
  })
}
