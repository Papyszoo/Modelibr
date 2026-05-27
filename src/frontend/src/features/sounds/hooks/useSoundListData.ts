import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { useSoundCategoriesQuery } from '@/features/sounds/api/queries'
import { getSoundsPaginated } from '@/features/sounds/api/soundApi'
import { useDebouncedValue } from '@/shared/hooks'

const UNASSIGNED_CATEGORY_ID = -1
const PAGE_SIZE = 50

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

export function useSoundListData(_showToast: ShowToast) {
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    UNASSIGNED_CATEGORY_ID
  )
  const [searchQuery, setSearchQuery] = useState('')

  const queryClient = useQueryClient()

  // 300ms debounce keeps each keystroke from spawning a fetch. The
  // client-side filter below still narrows the visible set instantly.
  const debouncedSearchName = useDebouncedValue(searchQuery.trim(), 300)

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['sounds', { searchName: debouncedSearchName || undefined }],
    queryFn: ({ pageParam }) =>
      getSoundsPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        searchName: debouncedSearchName || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.sounds.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const sounds = paginatedData?.pages.flatMap(p => p.sounds) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0
  const loading = isLoading

  const categoriesQuery = useSoundCategoriesQuery()
  const categories = categoriesQuery.data?.categories ?? []

  const invalidateSounds = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['sounds'] })
  }, [queryClient])

  const loadCategories = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['soundCategories'] })
  }, [queryClient])

  const filteredSounds = sounds.filter(sound => {
    if (activeCategoryId === UNASSIGNED_CATEGORY_ID) {
      return sound.categoryId === null
    }
    return sound.categoryId === activeCategoryId
  })

  return {
    sounds,
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
    filteredSounds,
    invalidateSounds,
    loadCategories,
  }
}
