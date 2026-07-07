import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createTextureSetCategory,
  deleteTextureSetCategory,
  updateTextureSet,
  updateTextureSetCategory,
} from '@/features/texture-set/api/textureSetApi'
import { ALL_CATEGORIES_ID } from '@/shared/types/categories'
import { collectCategoryBranchIds } from '@/shared/utils/categoryTree'
import {
  type TextureSetCategoryDto,
  type TextureSetDto,
  TextureSetKind,
} from '@/types'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface UseTextureSetCategoryMutationsOptions {
  showToast: ShowToast
  /** Kind the visible categories belong to — categories are scoped per kind. */
  categoriesKind: TextureSetKind
  activeCategoryId: number | null
  setActiveCategoryId: (id: number | null) => void
  categories: TextureSetCategoryDto[]
  clearSelection: () => void
}

export function useTextureSetCategoryMutations({
  showToast,
  categoriesKind,
  activeCategoryId,
  setActiveCategoryId,
  categories,
  clearSelection,
}: UseTextureSetCategoryMutationsOptions) {
  const queryClient = useQueryClient()

  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: ['textureSetCategories'] })
  const invalidateTextureSets = () =>
    queryClient.invalidateQueries({ queryKey: ['textureSets'] })

  const createCategoryMutation = useMutation({
    mutationFn: (vars: { name: string; parentId: number | null }) =>
      createTextureSetCategory({
        name: vars.name,
        parentId: vars.parentId ?? null,
        kind: categoriesKind,
      }),
    onSuccess: async created => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category created successfully',
        life: 3000,
      })
      setActiveCategoryId(created.id)
      await Promise.all([invalidateCategories(), invalidateTextureSets()])
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
    // Parent + kind pass through unchanged — a null parentId is treated as
    // "move to root", so omitting the current parent would silently re-root it.
    mutationFn: (vars: { category: TextureSetCategoryDto; name: string }) =>
      updateTextureSetCategory(vars.category.id, {
        name: vars.name,
        description: vars.category.description ?? undefined,
        parentId: vars.category.parentId ?? null,
        kind: categoriesKind,
      }),
    onSuccess: async () => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category renamed successfully',
        life: 3000,
      })
      await Promise.all([invalidateCategories(), invalidateTextureSets()])
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
    mutationFn: (categoryId: number) => deleteTextureSetCategory(categoryId),
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
      await Promise.all([invalidateCategories(), invalidateTextureSets()])
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
    mutationFn: async (vars: {
      textureSets: TextureSetDto[]
      categoryId: number | null
    }) => {
      // ModelOwned sets don't participate in the shared category system; the
      // backend would reject them with CategoryKindMismatch. Skip them.
      const eligible = vars.textureSets.filter(
        set => set.kind !== TextureSetKind.ModelOwned
      )
      await Promise.all(
        eligible.map(set =>
          updateTextureSet(set.id, {
            name: set.name,
            categoryId: vars.categoryId,
          })
        )
      )
      return eligible.length
    },
    onSuccess: async (movedCount, vars) => {
      const targetCategoryName =
        vars.categoryId === null
          ? 'Unassigned'
          : (categories.find(c => c.id === vars.categoryId)?.name ??
            'Unknown Category')
      showToast({
        severity: 'success',
        summary: 'Success',
        detail:
          movedCount === 1
            ? `Texture set moved to ${targetCategoryName}`
            : `${movedCount} texture sets moved to ${targetCategoryName}`,
        life: 3000,
      })
      clearSelection()
      await invalidateTextureSets()
    },
    onError: error => {
      console.error('Failed to move texture set category:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update texture set category',
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
