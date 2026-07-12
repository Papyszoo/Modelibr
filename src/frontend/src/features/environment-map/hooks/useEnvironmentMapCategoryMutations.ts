import { useQueryClient } from '@tanstack/react-query'

import { updateEnvironmentMapMetadata } from '@/features/environment-map/api/environmentMapApi'
import {
  createEnvironmentMapCategory,
  deleteEnvironmentMapCategory,
  updateEnvironmentMapCategory,
} from '@/features/environment-map/api/environmentMapCategoryApi'
import { type EnvironmentMapDto } from '@/features/environment-map/types'
import { useCategoryMutations } from '@/shared/hooks/useCategoryMutations'
import { type EnvironmentMapCategoryDto } from '@/types'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface UseEnvironmentMapCategoryMutationsOptions {
  showToast: ShowToast
  activeCategoryId: number | null
  setActiveCategoryId: (id: number | null) => void
  categories: EnvironmentMapCategoryDto[]
  clearSelection: () => void
}

export function useEnvironmentMapCategoryMutations({
  showToast,
  activeCategoryId,
  setActiveCategoryId,
  categories,
  clearSelection,
}: UseEnvironmentMapCategoryMutationsOptions) {
  const queryClient = useQueryClient()

  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: ['environment-map-categories'] })
  const invalidateEnvironmentMaps = () =>
    queryClient.invalidateQueries({ queryKey: ['environmentMaps'] })

  return useCategoryMutations<
    EnvironmentMapCategoryDto,
    EnvironmentMapCategoryDto,
    { environmentMaps: EnvironmentMapDto[]; categoryId: number | null }
  >({
    showToast,
    categories,
    activeCategoryId,
    setActiveCategoryId,
    clearSelection,
    noun: 'environment map',
    onCategoriesChanged: async () => {
      await Promise.all([invalidateCategories(), invalidateEnvironmentMaps()])
    },
    onAssetsChanged: invalidateEnvironmentMaps,
    createCategory: vars =>
      createEnvironmentMapCategory({
        name: vars.name,
        parentId: vars.parentId ?? null,
      }),
    renameCategory: vars =>
      updateEnvironmentMapCategory(vars.category.id, {
        name: vars.name,
        description: vars.category.description ?? undefined,
        parentId: vars.category.parentId ?? null,
      }),
    deleteCategory: deleteEnvironmentMapCategory,
    // The metadata endpoint replaces the full tag set, so tags are passed
    // through unchanged — omitting them would wipe an asset's tags on a move.
    moveToCategory: async vars => {
      await Promise.all(
        vars.environmentMaps.map(environmentMap =>
          updateEnvironmentMapMetadata(environmentMap.id, {
            tags: environmentMap.tags ?? [],
            categoryId: vars.categoryId,
          })
        )
      )
      return vars.environmentMaps.length
    },
  })
}
