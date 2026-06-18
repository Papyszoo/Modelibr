import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { useScriptCategoriesQuery } from '@/features/scripts/api/queries'
import { getScriptsPaginated } from '@/features/scripts/api/scriptApi'
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

export function useScriptListData(_showToast: ShowToast) {
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    UNASSIGNED_CATEGORY_ID
  )
  const [searchQuery, setSearchQuery] = useState('')
  // Language filter; null = all languages.
  const [language, setLanguage] = useState<string | null>(null)

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
    queryKey: [
      'scripts',
      {
        searchName: debouncedSearchName || undefined,
        language: language ?? undefined,
      },
    ],
    queryFn: ({ pageParam }) =>
      getScriptsPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        searchName: debouncedSearchName || undefined,
        language: language ?? undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.scripts.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const scripts = paginatedData?.pages.flatMap(p => p.scripts) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0
  const loading = isLoading

  const categoriesQuery = useScriptCategoriesQuery()
  const categories = categoriesQuery.data?.categories ?? []

  const invalidateScripts = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['scripts'] })
  }, [queryClient])

  const loadCategories = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['scriptCategories'] })
  }, [queryClient])

  const filteredScripts = scripts.filter(script => {
    if (activeCategoryId === UNASSIGNED_CATEGORY_ID) {
      return script.categoryId === null
    }
    return script.categoryId === activeCategoryId
  })

  return {
    scripts,
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
    language,
    setLanguage,
    filteredScripts,
    invalidateScripts,
    loadCategories,
  }
}
