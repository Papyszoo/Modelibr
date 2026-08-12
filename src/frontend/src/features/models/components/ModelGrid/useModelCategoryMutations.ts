import { useQueryClient } from '@tanstack/react-query'

import {
  createModelCategory,
  deleteModelCategory,
  updateModelCategory,
  updateModelTags,
} from '@/features/models/api/modelApi'
import { useCategoryMutations } from '@/shared/hooks/useCategoryMutations'
import { type ModelCategoryDto } from '@/types'
import { type Model } from '@/utils/fileUtils'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface UseModelCategoryMutationsOptions {
  showToast: ShowToast
  activeCategoryId: number | null
  setActiveCategoryId: (id: number | null) => void
  categories: ModelCategoryDto[]
  clearSelection: () => void
}

export function useModelCategoryMutations({
  showToast,
  activeCategoryId,
  setActiveCategoryId,
  categories,
  clearSelection,
}: UseModelCategoryMutationsOptions) {
  const queryClient = useQueryClient()

  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: ['model-categories'] })
  const invalidateModels = () =>
    queryClient.invalidateQueries({ queryKey: ['models'] })

  return useCategoryMutations<
    ModelCategoryDto,
    ModelCategoryDto,
    { models: Model[]; categoryId: number | null }
  >({
    showToast,
    categories,
    activeCategoryId,
    setActiveCategoryId,
    clearSelection,
    noun: 'model',
    onCategoriesChanged: async () => {
      await Promise.all([invalidateCategories(), invalidateModels()])
    },
    onAssetsChanged: invalidateModels,
    createCategory: vars =>
      createModelCategory({ name: vars.name, parentId: vars.parentId ?? null }),
    renameCategory: vars =>
      updateModelCategory(vars.category.id, {
        name: vars.name,
        description: vars.category.description ?? undefined,
        parentId: vars.category.parentId ?? null,
      }),
    deleteCategory: deleteModelCategory,
    // The metadata endpoint replaces the full tag set + description, so both
    // are passed through unchanged - omitting them would wipe an asset's tags
    // or description on a category move.
    moveToCategory: async vars => {
      await Promise.all(
        vars.models.map(model =>
          updateModelTags(
            String(model.id),
            model.tags ?? [],
            model.description ?? '',
            vars.categoryId
          )
        )
      )
      return vars.models.length
    },
  })
}
