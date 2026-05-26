import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getModelsPaginated } from '@/features/models/api/modelApi'
import {
  useModelCategoriesQuery,
  useModelTagsQuery,
  usePacksQuery,
  useProjectsQuery,
} from '@/features/models/api/queries'
import { useDebouncedValue } from '@/shared/hooks'
import { type PaginationState } from '@/types'

const PAGE_SIZE = 50

interface UseModelDataOptions {
  effectivePackIds: number[]
  effectiveProjectIds: number[]
  selectedCategoryIds: number[]
  selectedTagNames: string[]
  hasConceptImages: boolean
  textureSetId?: number
  searchQuery?: string
}

export function useModelData({
  effectivePackIds,
  effectiveProjectIds,
  selectedCategoryIds,
  selectedTagNames,
  hasConceptImages,
  textureSetId,
  searchQuery = '',
}: UseModelDataOptions) {
  const queryClient = useQueryClient()

  // Stable, ordered filter arrays for the React Query cache key. Sorting
  // before stringification means [1,2] and [2,1] share a cache slot.
  const sortedPackIds = [...effectivePackIds].sort((a, b) => a - b)
  const sortedProjectIds = [...effectiveProjectIds].sort((a, b) => a - b)
  const sortedCategoryIds = [...selectedCategoryIds].sort((a, b) => a - b)
  const sortedTagNames = [...selectedTagNames].sort()

  // Debounce typing — server fetch waits 300ms past the last keystroke.
  // Client-side filtering in useModelFilters keeps the visual snappy.
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
      'models',
      {
        packIds: sortedPackIds,
        projectIds: sortedProjectIds,
        textureSetId,
        categoryIds: sortedCategoryIds,
        tags: sortedTagNames,
        hasConceptImages,
        searchName: debouncedSearchName || undefined,
      },
    ],
    queryFn: ({ pageParam }) =>
      getModelsPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        packIds: sortedPackIds.length > 0 ? sortedPackIds : undefined,
        projectIds: sortedProjectIds.length > 0 ? sortedProjectIds : undefined,
        textureSetId,
        categoryIds:
          sortedCategoryIds.length > 0 ? sortedCategoryIds : undefined,
        tags: sortedTagNames.length > 0 ? sortedTagNames : undefined,
        hasConceptImages: hasConceptImages || undefined,
        searchName: debouncedSearchName || undefined,
      }),
    initialPageParam: 1,
    placeholderData: previousData => previousData,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  // Fetch filter options (packs and projects) with React Query
  const packsQuery = usePacksQuery()
  const projectsQuery = useProjectsQuery()
  const categoriesQuery = useModelCategoriesQuery()
  const tagsQuery = useModelTagsQuery()

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
    (_modelId: number) => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    [queryClient]
  )

  return {
    models,
    loading: isLoading && !paginatedData,
    error: queryError ? `Failed to fetch models: ${queryError.message}` : '',
    packs: packsQuery.data ?? [],
    projects: projectsQuery.data ?? [],
    categories: categoriesQuery.data ?? [],
    tags: tagsQuery.data ?? [],
    pagination,
    isLoadingMore: isFetchingNextPage,
    fetchModels,
    removeModel,
  }
}
