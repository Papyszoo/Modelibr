import { useState, useEffect, useCallback, useRef } from 'react'
import { Model } from '../../../../utils/fileUtils'
import { PackDto, ProjectDto, PaginationState } from '../../../../types'
import ApiClient from '../../../../services/ApiClient'

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
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [packs, setPacks] = useState<PackDto[]>([])
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalCount: 0,
    totalPages: 0,
    hasMore: false,
  })
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const filtersLoadedRef = useRef(false)

  const fetchFilterOptions = useCallback(async () => {
    if (filtersLoadedRef.current) return
    try {
      const [packsData, projectsData] = await Promise.all([
        ApiClient.getAllPacks(),
        ApiClient.getAllProjects(),
      ])
      setPacks(packsData)
      setProjects(projectsData)
      filtersLoadedRef.current = true
    } catch (err) {
      console.error('Failed to fetch filter options:', err)
    }
  }, [])

  const fetchModels = useCallback(
    async (loadMore = false) => {
      if (loadMore) {
        setIsLoadingMore(true)
      } else {
        setLoading(true)
      }
      try {
        const page = loadMore ? pagination.page + 1 : 1

        const options: {
          page: number
          pageSize: number
          packId?: number
          projectId?: number
          textureSetId?: number
        } = {
          page,
          pageSize: PAGE_SIZE,
        }
        if (effectivePackIds.length > 0) {
          options.packId = effectivePackIds[0]
        }
        if (effectiveProjectIds.length > 0) {
          options.projectId = effectiveProjectIds[0]
        }
        if (textureSetId) {
          options.textureSetId = textureSetId
        }

        const result = await ApiClient.getModelsPaginated(options)

        if (loadMore) {
          setModels(prev => [...prev, ...result.items])
        } else {
          setModels(result.items)
        }

        setPagination({
          page,
          pageSize: result.pageSize,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
          hasMore: page < result.totalPages,
        })
        setError('')
      } catch (err) {
        setError(
          `Failed to fetch models: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
      } finally {
        setLoading(false)
        setIsLoadingMore(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectivePackIds.join(','), effectiveProjectIds.join(','), textureSetId]
  )

  const removeModel = useCallback((modelId: number) => {
    setModels(prev => prev.filter(m => Number(m.id) !== modelId))
  }, [])

  // Load models and filter options in parallel on mount / filter change
  useEffect(() => {
    Promise.all([fetchModels(), fetchFilterOptions()])
  }, [fetchModels, fetchFilterOptions])

  return {
    models,
    loading,
    error,
    packs,
    projects,
    pagination,
    isLoadingMore,
    fetchModels,
    removeModel,
  }
}
