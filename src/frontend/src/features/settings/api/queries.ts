import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '@/lib/react-query'
import { getSettings } from './settingsApi'

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
