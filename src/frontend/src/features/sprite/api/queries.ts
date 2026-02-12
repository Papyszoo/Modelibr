import { queryOptions, useQuery } from '@tanstack/react-query'
import { QueryConfig } from '../../../lib/react-query'
import { getSpritesPaginated, getAllSpriteCategories } from './spriteApi'

// --- Sprites (paginated) ---

export function getSpritesQueryOptions(params: {
  page: number
  pageSize: number
}) {
  return queryOptions({
    queryKey: ['sprites', params] as const,
    queryFn: () => getSpritesPaginated(params),
  })
}

type UseSpritesQueryOptions = {
  params: { page: number; pageSize: number }
  queryConfig?: QueryConfig<typeof getSpritesQueryOptions>
}

export function useSpritesQuery({
  params,
  queryConfig = {},
}: UseSpritesQueryOptions) {
  return useQuery({
    ...getSpritesQueryOptions(params),
    ...queryConfig,
  })
}

// --- Sprite Categories ---

export function getSpriteCategoriesQueryOptions() {
  return queryOptions({
    queryKey: ['spriteCategories'] as const,
    queryFn: () => getAllSpriteCategories(),
  })
}

type UseSpriteCategoriesQueryOptions = {
  queryConfig?: QueryConfig<typeof getSpriteCategoriesQueryOptions>
}

export function useSpriteCategoriesQuery({
  queryConfig = {},
}: UseSpriteCategoriesQueryOptions = {}) {
  return useQuery({
    ...getSpriteCategoriesQueryOptions(),
    ...queryConfig,
  })
}
