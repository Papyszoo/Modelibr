import { queryOptions, useQuery } from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import {
  getAllProjects,
  getProjectBrief,
  getProjectProfileOptions,
} from './projectApi'

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

// --- Profile (v0.6 prompt 13) ---

/**
 * The profile vocabulary. One key for the whole app rather than one per project:
 * it is the same five closed-ish lists everywhere, and refetching it per project
 * page would be a request that never returns anything new.
 */
export function getProjectProfileOptionsQueryOptions() {
  return queryOptions({
    queryKey: ['projects', 'profile-options'] as const,
    queryFn: () => getProjectProfileOptions(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useProjectProfileOptionsQuery({
  queryConfig = {},
}: {
  queryConfig?: QueryConfig<typeof getProjectProfileOptionsQueryOptions>
} = {}) {
  return useQuery({
    ...getProjectProfileOptionsQueryOptions(),
    ...queryConfig,
  })
}

export function getProjectBriefQueryOptions(projectId: number) {
  return queryOptions({
    queryKey: ['projects', 'brief', projectId] as const,
    queryFn: () => getProjectBrief(projectId),
  })
}

export function useProjectBriefQuery({
  projectId,
  queryConfig = {},
}: {
  projectId: number
  queryConfig?: QueryConfig<typeof getProjectBriefQueryOptions>
}) {
  return useQuery({
    ...getProjectBriefQueryOptions(projectId),
    ...queryConfig,
  })
}
