import { queryOptions, useQuery } from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import { getMcpAgents, getMcpTools } from './mcpAgentsApi'
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

export function getMcpAgentsQueryOptions() {
  return queryOptions({
    queryKey: ['mcp-agents'] as const,
    queryFn: () => getMcpAgents(),
  })
}

type UseMcpAgentsQueryOptions = {
  queryConfig?: QueryConfig<typeof getMcpAgentsQueryOptions>
}

export function useMcpAgentsQuery({
  queryConfig = {},
}: UseMcpAgentsQueryOptions = {}) {
  return useQuery({
    ...getMcpAgentsQueryOptions(),
    ...queryConfig,
  })
}

export function getMcpToolsQueryOptions() {
  return queryOptions({
    queryKey: ['mcp-tools'] as const,
    queryFn: () => getMcpTools(),
  })
}

type UseMcpToolsQueryOptions = {
  queryConfig?: QueryConfig<typeof getMcpToolsQueryOptions>
}

export function useMcpToolsQuery({
  queryConfig = {},
}: UseMcpToolsQueryOptions = {}) {
  return useQuery({
    ...getMcpToolsQueryOptions(),
    ...queryConfig,
  })
}
