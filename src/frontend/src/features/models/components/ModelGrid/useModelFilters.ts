import { useCallback, useMemo, useState } from 'react'

import { type PageType, useCardWidthStore } from '@/stores/cardWidthStore'
import { type Model } from '@/utils/fileUtils'

export interface ModelCategorySelectionState {
  checked?: boolean
  partialChecked?: boolean
}

export type ModelCategorySelectionKeys = Record<
  string,
  ModelCategorySelectionState
>

interface UseModelFiltersOptions {
  packId?: number
  projectId?: number
}

export function useModelFilters({ packId, projectId }: UseModelFiltersOptions) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryKeys, setSelectedCategoryKeys] =
    useState<ModelCategorySelectionKeys>({})
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([])
  const [hasConceptImages, setHasConceptImages] = useState(false)
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

  const effectivePackIds = packId ? [packId] : selectedPackIds
  const effectiveProjectIds = projectId ? [projectId] : selectedProjectIds
  const selectedCategoryIds = useMemo(
    () =>
      Object.entries(selectedCategoryKeys)
        .filter(([, state]) => state?.checked)
        .map(([key]) => Number(key))
        .filter(Number.isFinite),
    [selectedCategoryKeys]
  )

  const handlePackFilterChange = useCallback(
    (packIds: number[]) => {
      if (!packId) setSelectedPackIds(packIds)
    },
    [packId]
  )

  const handleProjectFilterChange = useCallback(
    (projectIds: number[]) => {
      if (!projectId) setSelectedProjectIds(projectIds)
    },
    [projectId]
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
    searchQuery,
    setSearchQuery,
    selectedCategoryKeys,
    setSelectedCategoryKeys,
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
