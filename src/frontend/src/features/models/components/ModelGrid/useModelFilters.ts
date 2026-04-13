import { useCallback, useMemo, useState } from 'react'

import { type CategorySelectionKeys as ModelCategorySelectionKeys } from '@/shared/types/categories'
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
  const [selectedCategoryKeys, setSelectedCategoryKeys] =
    useState<ModelCategorySelectionKeys>({})
  const [localSelectedTagNames, setLocalSelectedTagNames] = useState<string[]>(
    []
  )
  const [localHasConceptImages, setLocalHasConceptImages] = useState(false)
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
  const currentSelectedCategoryKeys =
    (persistedViewState?.selectedCategoryKeys as ModelCategorySelectionKeys) ??
    selectedCategoryKeys
  const selectedTagNames =
    persistedViewState?.selectedTagNames ?? localSelectedTagNames
  const hasConceptImages =
    persistedViewState?.hasConceptImages ?? localHasConceptImages

  const effectivePackIds = packId ? [packId] : currentSelectedPackIds
  const effectiveProjectIds = projectId
    ? [projectId]
    : currentSelectedProjectIds
  const selectedCategoryIds = useMemo(
    () =>
      Object.entries(currentSelectedCategoryKeys)
        .filter(([, state]) => state?.checked)
        .map(([key]) => Number(key))
        .filter(Number.isFinite),
    [currentSelectedCategoryKeys]
  )

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

  const setSelectedCategoryKeysState = useCallback(
    (keys: ModelCategorySelectionKeys) => {
      if (persistedViewState && onPersistedViewStateChange) {
        onPersistedViewStateChange({ selectedCategoryKeys: keys })
        return
      }

      setSelectedCategoryKeys(keys)
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

  const filterModels = useCallback(
    (models: Model[]) => {
      if (!searchQuery) return models
      const query = searchQuery.toLowerCase()
      return models.filter(model => {
        const modelName = getModelName(model).toLowerCase()
        return modelName.includes(query)
      })
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
    selectedCategoryKeys: currentSelectedCategoryKeys,
    setSelectedCategoryKeys: setSelectedCategoryKeysState,
    selectedCategoryIds,
    selectedTagNames,
    setSelectedTagNames,
    hasConceptImages,
    setHasConceptImages,
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
