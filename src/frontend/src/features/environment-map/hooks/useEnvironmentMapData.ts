import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getEnvironmentMapsPaginated } from '@/features/environment-map/api/environmentMapApi'
import { useEnvironmentMapCategoriesQuery } from '@/features/environment-map/api/queries'
import { useModelTagsQuery } from '@/features/models/api/queries'
import { useDebouncedValue } from '@/shared/hooks'
import { type PaginationState } from '@/types'

const PAGE_SIZE = 50

interface UseEnvironmentMapDataOptions {
  effectivePackIds: number[]
  effectiveProjectIds: number[]
  selectedCategoryIds?: number[]
  searchQuery?: string
}

export function useEnvironmentMapData({
  effectivePackIds,
  effectiveProjectIds,
  selectedCategoryIds = [],
  searchQuery = '',
}: UseEnvironmentMapDataOptions) {
  const queryClient = useQueryClient()

  // Stable, sorted filter keys so [1,2] and [2,1] share a cache slot.
  const sortedPackIds = [...effectivePackIds].sort((a, b) => a - b)
  const sortedProjectIds = [...effectiveProjectIds].sort((a, b) => a - b)
  const sortedCategoryIds = [...selectedCategoryIds].sort((a, b) => a - b)

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
        categoryIds: sortedCategoryIds,
        searchName: debouncedSearchName || undefined,
      },
    ],
    queryFn: ({ pageParam }) =>
      getEnvironmentMapsPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        packIds: sortedPackIds.length > 0 ? sortedPackIds : undefined,
        projectIds: sortedProjectIds.length > 0 ? sortedProjectIds : undefined,
        categoryIds:
          sortedCategoryIds.length > 0 ? sortedCategoryIds : undefined,
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
  const tagsQuery = useModelTagsQuery()

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
    tags: tagsQuery.data ?? [],
    pagination,
    isLoadingMore: isFetchingNextPage,
    fetchEnvironmentMaps,
  }
}
