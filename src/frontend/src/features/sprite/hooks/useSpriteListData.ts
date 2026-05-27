import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { useSpriteCategoriesQuery } from '@/features/sprite/api/queries'
import { getSpritesPaginated } from '@/features/sprite/api/spriteApi'
import { useDebouncedValue } from '@/shared/hooks'

const UNASSIGNED_CATEGORY_ID = -1
const PAGE_SIZE = 50

export function useSpriteListData() {
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    UNASSIGNED_CATEGORY_ID
  )
  const [searchQuery, setSearchQuery] = useState('')

  const queryClient = useQueryClient()

  const debouncedSearchName = useDebouncedValue(searchQuery.trim(), 300)

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loading,
  } = useInfiniteQuery({
    queryKey: ['sprites', { searchName: debouncedSearchName || undefined }],
    queryFn: ({ pageParam }) =>
      getSpritesPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        searchName: debouncedSearchName || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.sprites.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const sprites = paginatedData?.pages.flatMap(p => p.sprites) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0

  const categoriesQuery = useSpriteCategoriesQuery()
  const categories = categoriesQuery.data?.categories ?? []

  const invalidateSprites = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['sprites'] })
  }, [queryClient])

  const loadCategories = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['spriteCategories'] })
  }, [queryClient])

  const filteredSprites = sprites.filter(sprite => {
    if (activeCategoryId === UNASSIGNED_CATEGORY_ID) {
      return sprite.categoryId === null
    }
    return sprite.categoryId === activeCategoryId
  })

  return {
    sprites,
    categories,
    loading,
    totalCount,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    fetchNextPage,
    activeCategoryId,
    setActiveCategoryId,
    searchQuery,
    setSearchQuery,
    filteredSprites,
    invalidateSprites,
    loadCategories,
  }
}
