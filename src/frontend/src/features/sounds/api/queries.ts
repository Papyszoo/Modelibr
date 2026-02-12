import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '@/lib/react-query'
import { getSoundsPaginated, getAllSoundCategories } from './soundApi'

// --- Sounds (paginated) ---

export function getSoundsQueryOptions(params: {
  page: number
  pageSize: number
}) {
  return queryOptions({
    queryKey: ['sounds', params] as const,
    queryFn: () => getSoundsPaginated(params),
  })
}

type UseSoundsQueryOptions = {
  params: { page: number; pageSize: number }
  queryConfig?: QueryConfig<typeof getSoundsQueryOptions>
}

export function useSoundsQuery({
  params,
  queryConfig = {},
}: UseSoundsQueryOptions) {
  return useQuery({
    ...getSoundsQueryOptions(params),
    ...queryConfig,
  })
}

// --- Sound Categories ---

export function getSoundCategoriesQueryOptions() {
  return queryOptions({
    queryKey: ['soundCategories'] as const,
    queryFn: () => getAllSoundCategories(),
  })
}

type UseSoundCategoriesQueryOptions = {
  queryConfig?: QueryConfig<typeof getSoundCategoriesQueryOptions>
}

export function useSoundCategoriesQuery({
  queryConfig = {},
}: UseSoundCategoriesQueryOptions = {}) {
  return useQuery({
    ...getSoundCategoriesQueryOptions(),
    ...queryConfig,
  })
}
