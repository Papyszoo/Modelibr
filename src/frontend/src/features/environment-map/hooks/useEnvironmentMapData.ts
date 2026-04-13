import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getEnvironmentMapsPaginated } from '@/features/environment-map/api/environmentMapApi'
import { useEnvironmentMapCategoriesQuery } from '@/features/environment-map/api/queries'
import { useModelTagsQuery } from '@/features/models/api/queries'
import { type PaginationState } from '@/types'

const PAGE_SIZE = 50

interface UseEnvironmentMapDataOptions {
  effectivePackIds: number[]
  effectiveProjectIds: number[]
}

export function useEnvironmentMapData({
  effectivePackIds,
  effectiveProjectIds,
}: UseEnvironmentMapDataOptions) {
  const queryClient = useQueryClient()

  const packId = effectivePackIds.length > 0 ? effectivePackIds[0] : undefined
  const projectId =
    effectiveProjectIds.length > 0 ? effectiveProjectIds[0] : undefined

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error: queryError,
  } = useInfiniteQuery({
    queryKey: ['environmentMaps', { packId, projectId }],
    queryFn: ({ pageParam }) =>
      getEnvironmentMapsPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        packId,
        projectId,
      }),
    initialPageParam: 1,
    placeholderData: previousData => previousData,
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
