import { queryOptions, useQuery } from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import {
  getAllSpriteCategories,
  getSpriteById,
  getSpritesPaginated,
} from './spriteApi'

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

export function getSpriteByIdQueryOptions(spriteId: number) {
  return queryOptions({
    queryKey: ['sprites', 'detail', spriteId] as const,
    queryFn: () => getSpriteById(spriteId),
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
