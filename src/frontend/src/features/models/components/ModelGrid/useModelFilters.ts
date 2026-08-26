import { useCallback, useMemo, useState } from 'react'

import { ALL_CATEGORIES_ID } from '@/shared/types/categories'
import { type UvStatus } from '@/shared/types/uvStatus'
import { type PageType, useCardWidthStore } from '@/stores/cardWidthStore'
import { type ModelListViewState } from '@/stores/modelListViewStore'
import { type Model } from '@/utils/fileUtils'

interface UseModelFiltersOptions {
  packId?: number
  projectId?: number
  persistedViewState?: ModelListViewState | null
  onPersistedViewStateChange?: (patch: Partial<ModelListViewState>) => void
}

export function useModelFilters({
  packId,
  projectId,
  persistedViewState,
  onPersistedViewStateChange,
}: UseModelFiltersOptions) {
  const [localIsSearchOpen, setLocalIsSearchOpen] = useState(false)
  const [localIsFiltersOpen, setLocalIsFiltersOpen] = useState(false)
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const [localActiveCategoryId, setLocalActiveCategoryId] = useState<
    number | null
  >(ALL_CATEGORIES_ID)
  const [localSelectedTagNames, setLocalSelectedTagNames] = useState<string[]>(
    []
  )
  const [localHasConceptImages, setLocalHasConceptImages] = useState(false)
  const [localAnimatedOnly, setLocalAnimatedOnly] = useState(false)
  const [localMinTriangleCount, setLocalMinTriangleCount] = useState<
    number | null
  >(null)
  const [localMaxTriangleCount, setLocalMaxTriangleCount] = useState<
    number | null
  >(null)
  const [localUvStatus, setLocalUvStatus] = useState<UvStatus | null>(null)
  const [selectedPackIds, setSelectedPackIds] = useState<number[]>(
    packId ? [packId] : []
  )
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>(
    projectId ? [projectId] : []
  )

  const storeKey: PageType = useMemo(() => {
    if (packId) return 'packs'
    if (projectId) return 'projects'
    return 'models'
  }, [packId, projectId])

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings[storeKey]

  const isSearchOpen = persistedViewState?.isSearchOpen ?? localIsSearchOpen
  const isFiltersOpen = persistedViewState?.isFiltersOpen ?? localIsFiltersOpen
  const searchQuery = persistedViewState?.searchQuery ?? localSearchQuery
  const currentSelectedPackIds =
    persistedViewState?.selectedPackIds ?? selectedPackIds
  const currentSelectedProjectIds =
    persistedViewState?.selectedProjectIds ?? selectedProjectIds
  const activeCategoryId =
    persistedViewState?.activeCategoryId ?? localActiveCategoryId
  const selectedTagNames =
    persistedViewState?.selectedTagNames ?? localSelectedTagNames
  const hasConceptImages =
    persistedViewState?.hasConceptImages ?? localHasConceptImages
  const animatedOnly = persistedViewState?.animatedOnly ?? localAnimatedOnly
  const minTriangleCount =
    persistedViewState?.minTriangleCount ?? localMinTriangleCount
  const maxTriangleCount =
    persistedViewState?.maxTriangleCount ?? localMaxTriangleCount
  const uvStatus = persistedViewState?.uvStatus ?? localUvStatus

  const effectivePackIds = packId ? [packId] : currentSelectedPackIds
  const effectiveProjectIds = projectId
    ? [projectId]
    : currentSelectedProjectIds
  const setIsSearchOpen = useCallback(
    (value: boolean) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ isSearchOpen: value })
        return
      }

      setLocalIsSearchOpen(value)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const setIsFiltersOpen = useCallback(
    (value: boolean) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ isFiltersOpen: value })
        return
      }

      setLocalIsFiltersOpen(value)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const setSearchQuery = useCallback(
    (value: string) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ searchQuery: value })
        return
      }

      setLocalSearchQuery(value)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const handlePackFilterChange = useCallback(
    (packIds: number[]) => {
      if (packId) {
        return
      }

      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ selectedPackIds: packIds })
        return
      }

      setSelectedPackIds(packIds)
    },
    [onPersistedViewStateChange, packId, persistedViewState]
  )

  const handleProjectFilterChange = useCallback(
    (projectIds: number[]) => {
      if (projectId) {
        return
      }

      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ selectedProjectIds: projectIds })
        return
      }

      setSelectedProjectIds(projectIds)
    },
    [onPersistedViewStateChange, persistedViewState, projectId]
  )

  const setActiveCategoryId = useCallback(
    (id: number | null) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ activeCategoryId: id })
        return
      }

      setLocalActiveCategoryId(id)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const setSelectedTagNames = useCallback(
    (tags: string[]) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ selectedTagNames: tags })
        return
      }

      setLocalSelectedTagNames(tags)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const setHasConceptImages = useCallback(
    (value: boolean) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ hasConceptImages: value })
        return
      }

      setLocalHasConceptImages(value)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const setAnimatedOnly = useCallback(
    (value: boolean) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ animatedOnly: value })
        return
      }

      setLocalAnimatedOnly(value)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const setMinTriangleCount = useCallback(
    (value: number | null) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ minTriangleCount: value })
        return
      }

      setLocalMinTriangleCount(value)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const setMaxTriangleCount = useCallback(
    (value: number | null) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ maxTriangleCount: value })
        return
      }

      setLocalMaxTriangleCount(value)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const setUvStatus = useCallback(
    (value: UvStatus | null) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ uvStatus: value })
        return
      }

      setLocalUvStatus(value)
    },
    [onPersistedViewStateChange, persistedViewState]
  )

  const handleCardWidthChange = useCallback(
    (width: number) => {
      setCardWidth(storeKey, width)
    },
    [setCardWidth, storeKey]
  )

  const getModelName = useCallback((model: Model) => {
    if (model.name) return model.name
    if (model.files && model.files.length > 0)
      return model.files[0].originalFileName
    return `Model ${model.id}`
  }, [])

  // Category scoping is server-side (useModelData); only the name search stays
  // client-side to keep typing snappy while the debounced fetch catches up.
  const filterModels = useCallback(
    (models: Model[]) => {
      const query = searchQuery.trim().toLowerCase()
      if (!query) {
        return models
      }
      return models.filter(model =>
        getModelName(model).toLowerCase().includes(query)
      )
    },
    [searchQuery, getModelName]
  )

  return {
    isSearchOpen,
    setIsSearchOpen,
    isFiltersOpen,
    setIsFiltersOpen,
    searchQuery,
    setSearchQuery,
    activeCategoryId,
    setActiveCategoryId,
    selectedTagNames,
    setSelectedTagNames,
    hasConceptImages,
    setHasConceptImages,
    animatedOnly,
    setAnimatedOnly,
    minTriangleCount,
    setMinTriangleCount,
    maxTriangleCount,
    setMaxTriangleCount,
    uvStatus,
    setUvStatus,
    effectivePackIds,
    effectiveProjectIds,
    handlePackFilterChange,
    handleProjectFilterChange,
    packFilterDisabled: !!packId,
    projectFilterDisabled: !!projectId,
    cardWidth,
    handleCardWidthChange,
    getModelName,
    filterModels,
  }
}
