import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getEnvironmentMapsPaginated } from '@/features/environment-map/api/environmentMapApi'
import {
  useEnvironmentMapCategoriesQuery,
  useEnvironmentMapCategoryCountsQuery,
} from '@/features/environment-map/api/queries'
import { useModelTagsQuery } from '@/features/models/api/queries'
import { useDebouncedValue } from '@/shared/hooks'
import {
  isRealCategoryId,
  toCategoryCountMap,
  UNASSIGNED_CATEGORY_ID,
} from '@/shared/types/categories'
import { type PaginationState } from '@/types'

const PAGE_SIZE = 50

interface UseEnvironmentMapDataOptions {
  effectivePackIds: number[]
  effectiveProjectIds: number[]
  searchQuery?: string
  /** Active sidebar category; scopes the server query (real id or Unassigned). */
  activeCategoryId?: number | null
}

export function useEnvironmentMapData({
  effectivePackIds,
  effectiveProjectIds,
  searchQuery = '',
  activeCategoryId = null,
}: UseEnvironmentMapDataOptions) {
  const queryClient = useQueryClient()

  // Stable, sorted filter keys so [1,2] and [2,1] share a cache slot.
  const sortedPackIds = [...effectivePackIds].sort((a, b) => a - b)
  const sortedProjectIds = [...effectiveProjectIds].sort((a, b) => a - b)

  // Category scoping is server-side so filtered views + totals are complete.
  const categoryIds = isRealCategoryId(activeCategoryId)
    ? [activeCategoryId]
    : undefined
  const uncategorized = activeCategoryId === UNASSIGNED_CATEGORY_ID

  const debouncedSearchName = useDebouncedValue(searchQuery.trim(), 300)

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error: queryError,
  } = useInfiniteQuery({
    queryKey: [
      'environmentMaps',
      {
        packIds: sortedPackIds,
        projectIds: sortedProjectIds,
        categoryIds,
        uncategorized,
        searchName: debouncedSearchName || undefined,
      },
    ],
    queryFn: ({ pageParam }) =>
      getEnvironmentMapsPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        packIds: sortedPackIds.length > 0 ? sortedPackIds : undefined,
        projectIds: sortedProjectIds.length > 0 ? sortedProjectIds : undefined,
        categoryIds,
        uncategorized: uncategorized || undefined,
        searchName: debouncedSearchName || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (sum, p) => sum + p.environmentMaps.length,
        0
      )
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const categoriesQuery = useEnvironmentMapCategoriesQuery()
  const categoryCountsQuery = useEnvironmentMapCategoryCountsQuery()
  const tagsQuery = useModelTagsQuery()

  // Server-computed true totals for the sidebar badges.
  const categoryCounts = toCategoryCountMap(categoryCountsQuery.data)
  const unassignedCount = categoryCountsQuery.data?.uncategorizedCount ?? 0
  const allCount = categoryCountsQuery.data?.totalCount ?? 0

  const environmentMaps =
    paginatedData?.pages.flatMap(p => p.environmentMaps) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0
  const totalPages = paginatedData?.pages[0]?.totalPages ?? 0

  const pagination: PaginationState = {
    page: paginatedData?.pages.length ?? 1,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages,
    hasMore: hasNextPage ?? false,
  }

  const fetchEnvironmentMaps = useCallback(
    async (loadMore = false) => {
      if (loadMore) {
        await fetchNextPage()
      } else {
        await queryClient.invalidateQueries({
          queryKey: ['environmentMaps'],
        })
      }
    },
    [fetchNextPage, queryClient]
  )

  return {
    environmentMaps,
    loading: isLoading && !paginatedData,
    error: queryError
      ? `Failed to fetch environment maps: ${queryError.message}`
      : '',
    categories: categoriesQuery.data ?? [],
    categoryCounts,
    unassignedCount,
    allCount,
    tags: tagsQuery.data ?? [],
    pagination,
    isLoadingMore: isFetchingNextPage,
    fetchEnvironmentMaps,
  }
}
