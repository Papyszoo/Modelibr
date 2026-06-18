import { queryOptions, useQuery } from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import { getAllScriptCategories, getScriptsPaginated } from './scriptApi'
import { getAllScriptTemplates } from './templateApi'

// --- Scripts (paginated) ---

export function getScriptsQueryOptions(params: {
  page: number
  pageSize: number
}) {
  return queryOptions({
    queryKey: ['scripts', params] as const,
    queryFn: () => getScriptsPaginated(params),
  })
}

type UseScriptsQueryOptions = {
  params: { page: number; pageSize: number }
  queryConfig?: QueryConfig<typeof getScriptsQueryOptions>
}

export function useScriptsQuery({
  params,
  queryConfig = {},
}: UseScriptsQueryOptions) {
  return useQuery({
    ...getScriptsQueryOptions(params),
    ...queryConfig,
  })
}

// --- Script Categories ---

export function getScriptCategoriesQueryOptions() {
  return queryOptions({
    queryKey: ['scriptCategories'] as const,
    queryFn: () => getAllScriptCategories(),
  })
}

type UseScriptCategoriesQueryOptions = {
  queryConfig?: QueryConfig<typeof getScriptCategoriesQueryOptions>
}

export function useScriptCategoriesQuery({
  queryConfig = {},
}: UseScriptCategoriesQueryOptions = {}) {
  return useQuery({
    ...getScriptCategoriesQueryOptions(),
    ...queryConfig,
  })
}

// --- Script Templates ---

export function getScriptTemplatesQueryOptions() {
  return queryOptions({
    queryKey: ['scriptTemplates'] as const,
    queryFn: () => getAllScriptTemplates(),
  })
}

export function useScriptTemplatesQuery({
  queryConfig = {},
}: {
  queryConfig?: QueryConfig<typeof getScriptTemplatesQueryOptions>
} = {}) {
  return useQuery({
    ...getScriptTemplatesQueryOptions(),
    ...queryConfig,
  })
}
