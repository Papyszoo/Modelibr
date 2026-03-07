import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getModelsPaginated } from '@/features/models/api/modelApi'
import { usePacksQuery, useProjectsQuery } from '@/features/models/api/queries'
import { type PaginationState } from '@/types'

const PAGE_SIZE = 50

interface UseModelDataOptions {
  effectivePackIds: number[]
  effectiveProjectIds: number[]
  textureSetId?: number
}

export function useModelData({
  effectivePackIds,
  effectiveProjectIds,
  textureSetId,
}: UseModelDataOptions) {
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
    queryKey: ['models', { packId, projectId, textureSetId }],
    queryFn: ({ pageParam }) =>
      getModelsPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        packId,
        projectId,
        textureSetId,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  // Fetch filter options (packs and projects) with React Query
  const packsQuery = usePacksQuery()
  const projectsQuery = useProjectsQuery()

  const models = paginatedData?.pages.flatMap(p => p.items) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0
  const totalPages = paginatedData?.pages[0]?.totalPages ?? 0

  const pagination: PaginationState = {
    page: paginatedData?.pages.length ?? 1,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages,
    hasMore: hasNextPage ?? false,
  }

  const fetchModels = useCallback(
    async (loadMore = false) => {
      if (loadMore) {
        await fetchNextPage()
      } else {
        await queryClient.invalidateQueries({ queryKey: ['models'] })
      }
    },
    [fetchNextPage, queryClient]
  )

  const removeModel = useCallback(
    (modelId: number) => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    [queryClient]
  )

  return {
    models,
    loading: isLoading,
    error: queryError ? `Failed to fetch models: ${queryError.message}` : '',
    packs: packsQuery.data ?? [],
    projects: projectsQuery.data ?? [],
    pagination,
    isLoadingMore: isFetchingNextPage,
    fetchModels,
    removeModel,
  }
}
