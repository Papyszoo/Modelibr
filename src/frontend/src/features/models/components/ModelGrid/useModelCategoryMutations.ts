import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createModelCategory,
  deleteModelCategory,
  updateModelCategory,
  updateModelTags,
} from '@/features/models/api/modelApi'
import { ALL_CATEGORIES_ID } from '@/shared/types/categories'
import { collectCategoryBranchIds } from '@/shared/utils/categoryTree'
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

  const createCategoryMutation = useMutation({
    mutationFn: (vars: { name: string; parentId: number | null }) =>
      createModelCategory({ name: vars.name, parentId: vars.parentId ?? null }),
    onSuccess: async created => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category created successfully',
        life: 3000,
      })
      setActiveCategoryId(created.id)
      await Promise.all([invalidateCategories(), invalidateModels()])
    },
    onError: error => {
      console.error('Failed to create category:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create category',
        life: 3000,
      })
    },
  })

  const renameCategoryMutation = useMutation({
    // Parent passes through unchanged — a null parentId is treated as "move to
    // root", so omitting the current parent would silently re-root the category.
    mutationFn: (vars: { category: ModelCategoryDto; name: string }) =>
      updateModelCategory(vars.category.id, {
        name: vars.name,
        description: vars.category.description ?? undefined,
        parentId: vars.category.parentId ?? null,
      }),
    onSuccess: async () => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category renamed successfully',
        life: 3000,
      })
      await Promise.all([invalidateCategories(), invalidateModels()])
    },
    onError: error => {
      console.error('Failed to rename category:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to rename category',
        life: 3000,
      })
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: (categoryId: number) => deleteModelCategory(categoryId),
    onSuccess: async (_data, categoryId) => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category deleted successfully',
        life: 3000,
      })
      // Deleting removes the whole branch, so a selection anywhere inside it
      // (not just the deleted node) must fall back to "All".
      const deletedBranch = collectCategoryBranchIds(categories, categoryId)
      if (activeCategoryId !== null && deletedBranch.has(activeCategoryId)) {
        setActiveCategoryId(ALL_CATEGORIES_ID)
      }
      await Promise.all([invalidateCategories(), invalidateModels()])
    },
    onError: error => {
      console.error('Failed to delete category:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete category',
        life: 3000,
      })
    },
  })

  const moveToCategoryMutation = useMutation({
    // The metadata endpoint replaces the full tag set + description, so both
    // are passed through unchanged — omitting them would wipe an asset's tags
    // or description on a category move.
    mutationFn: async (vars: {
      models: Model[]
      categoryId: number | null
    }) => {
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
    },
    onSuccess: async (_data, vars) => {
      const targetCategoryName =
        vars.categoryId === null
          ? 'Unassigned'
          : (categories.find(c => c.id === vars.categoryId)?.name ??
            'Unknown Category')
      const count = vars.models.length
      showToast({
        severity: 'success',
        summary: 'Success',
        detail:
          count === 1
            ? `Model moved to ${targetCategoryName}`
            : `${count} models moved to ${targetCategoryName}`,
        life: 3000,
      })
      clearSelection()
      await invalidateModels()
    },
    onError: error => {
      console.error('Failed to move model category:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update model category',
        life: 3000,
      })
    },
  })

  return {
    createCategoryMutation,
    renameCategoryMutation,
    deleteCategoryMutation,
    moveToCategoryMutation,
  }
}
