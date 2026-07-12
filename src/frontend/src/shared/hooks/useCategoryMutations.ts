import { useMutation } from '@tanstack/react-query'

import {
  ALL_CATEGORIES_ID,
  type HierarchicalCategory,
} from '@/shared/types/categories'
import { collectCategoryBranchIds } from '@/shared/utils/categoryTree'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

/**
 * Per-asset-type configuration for the shared category-mutations factory.
 * Every asset type's category sidebar drives the same four operations
 * (create / rename / delete / move); this hook owns the identical
 * orchestration — toasts, `setActiveCategoryId` on create, the delete-branch
 * fallback to "All", `clearSelection` on move — and the callers inject the
 * asset-type-specific API calls, invalidation, and toast noun. The hook stays
 * dumb: no asset-type awareness lives here.
 */
export interface UseCategoryMutationsConfig<
  TCategory extends HierarchicalCategory,
  TCreated extends { id: number },
  TMoveVars extends { categoryId: number | null },
> {
  showToast: ShowToast
  categories: TCategory[]
  activeCategoryId: number | null
  setActiveCategoryId: (id: number | null) => void
  /** Clears the multi-select after a successful move. */
  clearSelection: () => void
  /** Singular lowercase noun for move toasts, e.g. "model", "texture set". */
  noun: string
  /**
   * Invalidate/refetch categories + assets after a create/rename/delete.
   * Reconciles the two families: query-key invalidation (model/texture/env-map)
   * vs imperative load callbacks (sounds/scripts/sprites).
   */
  onCategoriesChanged: () => Promise<void>
  /** Invalidate/refetch assets after a move. */
  onAssetsChanged: () => Promise<void>
  createCategory: (vars: {
    name: string
    parentId: number | null
  }) => Promise<TCreated>
  renameCategory: (vars: {
    category: TCategory
    name: string
  }) => Promise<unknown>
  deleteCategory: (categoryId: number) => Promise<unknown>
  /** Performs the move; returns the number actually moved (for the toast). */
  moveToCategory: (vars: TMoveVars) => Promise<number>
}

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

export function useCategoryMutations<
  TCategory extends HierarchicalCategory,
  TCreated extends { id: number },
  TMoveVars extends { categoryId: number | null },
>({
  showToast,
  categories,
  activeCategoryId,
  setActiveCategoryId,
  clearSelection,
  noun,
  onCategoriesChanged,
  onAssetsChanged,
  createCategory,
  renameCategory,
  deleteCategory,
  moveToCategory,
}: UseCategoryMutationsConfig<TCategory, TCreated, TMoveVars>) {
  // Each injected function is called with exactly its declared argument —
  // React Query v5 forwards a second mutation-context object to `mutationFn`,
  // which would otherwise leak into a directly-passed API function.
  const createCategoryMutation = useMutation({
    mutationFn: (vars: { name: string; parentId: number | null }) =>
      createCategory(vars),
    onSuccess: async created => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category created successfully',
        life: 3000,
      })
      setActiveCategoryId(created.id)
      await onCategoriesChanged()
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
    // The caller's `renameCategory` passes the existing parentId (and any
    // per-type extras like texture `kind`) through unchanged — the update
    // endpoints treat a null parentId as "move to root", so dropping the
    // current parent would silently re-root the category.
    mutationFn: (vars: { category: TCategory; name: string }) =>
      renameCategory(vars),
    onSuccess: async () => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category renamed successfully',
        life: 3000,
      })
      await onCategoriesChanged()
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
    mutationFn: (categoryId: number) => deleteCategory(categoryId),
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
      await onCategoriesChanged()
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
    // The caller's `moveToCategory` builds the per-type payload that PRESERVES
    // tags/description/name (the update endpoints replace the full set) and
    // returns the count actually moved (which may differ from the input count,
    // e.g. after excluding ModelOwned texture sets).
    mutationFn: (vars: TMoveVars) => moveToCategory(vars),
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
            ? `${capitalize(noun)} moved to ${targetCategoryName}`
            : `${movedCount} ${noun}s moved to ${targetCategoryName}`,
        life: 3000,
      })
      clearSelection()
      await onAssetsChanged()
    },
    onError: error => {
      console.error(`Failed to move ${noun} category:`, error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to update ${noun} category`,
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
