import { queryOptions, useQuery } from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import { getSettings, getThumbnailWorkers } from './settingsApi'

export function getSettingsQueryOptions() {
  return queryOptions({
    queryKey: ['settings'] as const,
    queryFn: () => getSettings(),
  })
}

type UseSettingsQueryOptions = {
  queryConfig?: QueryConfig<typeof getSettingsQueryOptions>
}

export function useSettingsQuery({
  queryConfig = {},
}: UseSettingsQueryOptions = {}) {
  return useQuery({
    ...getSettingsQueryOptions(),
    ...queryConfig,
  })
}

export function getThumbnailWorkersQueryOptions() {
  return queryOptions({
    queryKey: ['thumbnail-workers'] as const,
    queryFn: () => getThumbnailWorkers(),
  })
}

type UseThumbnailWorkersQueryOptions = {
  queryConfig?: QueryConfig<typeof getThumbnailWorkersQueryOptions>
}

/** Worker capabilities (render backend) for the Settings Thumbnail section.
 * Polls so a worker's backend appears once it has rendered its first job. */
export function useThumbnailWorkersQuery({
  queryConfig = {},
}: UseThumbnailWorkersQueryOptions = {}) {
  return useQuery({
    ...getThumbnailWorkersQueryOptions(),
    refetchInterval: 15000,
    ...queryConfig,
  })
}
