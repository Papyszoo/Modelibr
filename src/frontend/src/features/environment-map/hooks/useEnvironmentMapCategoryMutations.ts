import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateEnvironmentMapMetadata } from '@/features/environment-map/api/environmentMapApi'
import {
  createEnvironmentMapCategory,
  deleteEnvironmentMapCategory,
  updateEnvironmentMapCategory,
} from '@/features/environment-map/api/environmentMapCategoryApi'
import { type EnvironmentMapDto } from '@/features/environment-map/types'
import { ALL_CATEGORIES_ID } from '@/shared/types/categories'
import { collectCategoryBranchIds } from '@/shared/utils/categoryTree'
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

  const createCategoryMutation = useMutation({
    mutationFn: (vars: { name: string; parentId: number | null }) =>
      createEnvironmentMapCategory({
        name: vars.name,
        parentId: vars.parentId ?? null,
      }),
    onSuccess: async created => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category created successfully',
        life: 3000,
      })
      setActiveCategoryId(created.id)
      await Promise.all([invalidateCategories(), invalidateEnvironmentMaps()])
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
    // Parent is passed through unchanged — the update endpoint treats a null
    // parentId as "move to root", so omitting the current parent would
    // silently re-root the category.
    mutationFn: (vars: { category: EnvironmentMapCategoryDto; name: string }) =>
      updateEnvironmentMapCategory(vars.category.id, {
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
      await Promise.all([invalidateCategories(), invalidateEnvironmentMaps()])
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
    mutationFn: (categoryId: number) =>
      deleteEnvironmentMapCategory(categoryId),
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
      await Promise.all([invalidateCategories(), invalidateEnvironmentMaps()])
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
    // Tags are preserved on the metadata update — the endpoint replaces the
    // full tag set, so omitting them would wipe an asset's tags on a move.
    mutationFn: async (vars: {
      environmentMaps: EnvironmentMapDto[]
      categoryId: number | null
    }) => {
      await Promise.all(
        vars.environmentMaps.map(environmentMap =>
          updateEnvironmentMapMetadata(environmentMap.id, {
            tags: environmentMap.tags ?? [],
            categoryId: vars.categoryId,
          })
        )
      )
    },
    onSuccess: async (_data, vars) => {
      const targetCategoryName =
        vars.categoryId === null
          ? 'Unassigned'
          : (categories.find(c => c.id === vars.categoryId)?.name ??
            'Unknown Category')
      const count = vars.environmentMaps.length
      showToast({
        severity: 'success',
        summary: 'Success',
        detail:
          count === 1
            ? `Environment map moved to ${targetCategoryName}`
            : `${count} environment maps moved to ${targetCategoryName}`,
        life: 3000,
      })
      clearSelection()
      await invalidateEnvironmentMaps()
    },
    onError: error => {
      console.error('Failed to move environment map category:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update environment map category',
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
