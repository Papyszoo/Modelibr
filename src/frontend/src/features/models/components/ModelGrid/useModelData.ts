import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Model } from '@/utils/fileUtils'
import { PaginationState } from '@/types'
import {
  useModelsQuery,
  usePacksQuery,
  useProjectsQuery,
  getModelsQueryOptions,
} from '@/features/models/api/queries'

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
  const [page, setPage] = useState(1)
  const [accumulatedModels, setAccumulatedModels] = useState<Model[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Build query params from filters
  const queryParams = {
    page,
    pageSize: PAGE_SIZE,
    packId: effectivePackIds.length > 0 ? effectivePackIds[0] : undefined,
    projectId:
      effectiveProjectIds.length > 0 ? effectiveProjectIds[0] : undefined,
    textureSetId,
  }

  // Fetch models with React Query
  const modelsQuery = useModelsQuery({ params: queryParams })

  // Fetch filter options (packs and projects) with React Query
  const packsQuery = usePacksQuery()
  const projectsQuery = useProjectsQuery()

  // Derive pagination state from query result
  const queryData = modelsQuery.data
  const pagination: PaginationState = queryData
    ? {
        page: queryData.page,
        pageSize: queryData.pageSize,
        totalCount: queryData.totalCount,
        totalPages: queryData.totalPages,
        hasMore: queryData.page < queryData.totalPages,
      }
    : {
        page: 1,
        pageSize: PAGE_SIZE,
        totalCount: 0,
        totalPages: 0,
        hasMore: false,
      }

  // Combine accumulated models (from load-more) with current page data
  const models =
    accumulatedModels.length > 0 && page > 1
      ? accumulatedModels
      : (queryData?.items ?? [])

  const fetchModels = useCallback(
    async (loadMore = false) => {
      if (loadMore && queryData) {
        setIsLoadingMore(true)
        const nextPage = page + 1
        try {
          // Fetch next page and accumulate
          const nextData = await queryClient.fetchQuery(
            getModelsQueryOptions({
              ...queryParams,
              page: nextPage,
            })
          )
          setAccumulatedModels(prev => {
            const current = prev.length > 0 ? prev : queryData.items
            return [...current, ...nextData.items]
          })
          setPage(nextPage)
        } finally {
          setIsLoadingMore(false)
        }
      } else {
        // Reset to page 1 — React Query will automatically refetch
        setPage(1)
        setAccumulatedModels([])
        await queryClient.invalidateQueries({ queryKey: ['models'] })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      queryClient,
      page,
      queryData,
      queryParams.packId,
      queryParams.projectId,
      queryParams.textureSetId,
    ]
  )

  const removeModel = useCallback(
    (modelId: number) => {
      setAccumulatedModels(prev => {
        if (prev.length > 0) {
          return prev.filter(m => Number(m.id) !== modelId)
        }
        return prev
      })
      // Also invalidate the query so it refetches without the deleted model
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    [queryClient]
  )

  // Determine loading state
  const loading = modelsQuery.isLoading

  // Determine error state
  const error = modelsQuery.error
    ? `Failed to fetch models: ${modelsQuery.error.message}`
    : ''

  return {
    models,
    loading,
    error,
    packs: packsQuery.data ?? [],
    projects: projectsQuery.data ?? [],
    pagination,
    isLoadingMore,
    fetchModels,
    removeModel,
  }
}
