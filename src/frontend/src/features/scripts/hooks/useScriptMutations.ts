import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createScriptCategory,
  deleteScriptCategory,
  softDeleteScript,
  updateScript,
  updateScriptCategory,
} from '@/features/scripts/api/scriptApi'
import { ALL_CATEGORIES_ID } from '@/shared/types/categories'
import { collectCategoryBranchIds } from '@/shared/utils/categoryTree'
import { type ScriptCategoryDto } from '@/types'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface UseScriptMutationsOptions {
  showToast: ShowToast
  loadScripts: () => Promise<void>
  loadCategories: () => Promise<void>
  activeCategoryId: number | null
  setActiveCategoryId: (id: number | null) => void
  categories: ScriptCategoryDto[]
  setSelectedScriptIds: (ids: Set<number>) => void
  setContextMenuTarget: (target: null) => void
}

export function useScriptMutations({
  showToast,
  loadScripts,
  loadCategories,
  activeCategoryId,
  setActiveCategoryId,
  categories,
  setSelectedScriptIds,
  setContextMenuTarget,
}: UseScriptMutationsOptions) {
  const queryClient = useQueryClient()
  const createCategoryMutation = useMutation({
    mutationFn: async (vars: { name: string; parentId: number | null }) =>
      createScriptCategory(vars.name, undefined, vars.parentId),
    onSuccess: async created => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category created successfully',
        life: 3000,
      })
      setActiveCategoryId(created.id)
      await loadCategories()
      await loadScripts()
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
    // Description and parent are passed through unchanged — the update
    // endpoint treats a null parentId as "move to root", so omitting the
    // current parent would silently re-parent the category.
    mutationFn: async (vars: { category: ScriptCategoryDto; name: string }) =>
      updateScriptCategory(
        vars.category.id,
        vars.name,
        vars.category.description ?? undefined,
        vars.category.parentId ?? null
      ),
    onSuccess: async () => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category renamed successfully',
        life: 3000,
      })
      await loadCategories()
      await loadScripts()
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
    mutationFn: async (categoryId: number) => {
      await deleteScriptCategory(categoryId)
    },
    onSuccess: async (_data, categoryId) => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category deleted successfully',
        life: 3000,
      })
      // Deleting removes the whole branch, so a selection anywhere inside
      // it (not just the deleted node) must fall back to "All".
      const deletedBranch = collectCategoryBranchIds(categories, categoryId)
      if (activeCategoryId !== null && deletedBranch.has(activeCategoryId)) {
        setActiveCategoryId(ALL_CATEGORIES_ID)
      }
      await loadCategories()
      await loadScripts()
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

  const moveScriptsToCategoryMutation = useMutation({
    mutationFn: async (vars: {
      scriptIds: number[]
      categoryId: number | null
    }) => {
      await Promise.all(
        vars.scriptIds.map(id =>
          updateScript(id, { categoryId: vars.categoryId })
        )
      )
    },
    onSuccess: async (_data, vars) => {
      const targetCategoryName =
        vars.categoryId === null
          ? 'Unassigned'
          : categories.find(c => c.id === vars.categoryId)?.name ||
            'Unknown Category'
      const message =
        vars.scriptIds.length === 1
          ? `Script moved to ${targetCategoryName}`
          : `${vars.scriptIds.length} scripts moved to ${targetCategoryName}`

      showToast({
        severity: 'success',
        summary: 'Success',
        detail: message,
        life: 3000,
      })
      setSelectedScriptIds(new Set())
      await loadScripts()
    },
    onError: error => {
      console.error('Failed to update script category:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update script category',
        life: 3000,
      })
    },
  })

  const recycleScriptsMutation = useMutation({
    mutationFn: async (scriptIds: number[]) => {
      await Promise.all(scriptIds.map(id => softDeleteScript(id)))
    },
    onSuccess: async (_data, scriptIds) => {
      showToast({
        severity: 'success',
        summary: 'Recycled',
        detail:
          scriptIds.length > 1
            ? `${scriptIds.length} scripts moved to recycle bin`
            : 'Script moved to recycle bin',
        life: 3000,
      })
      setSelectedScriptIds(new Set())
      setContextMenuTarget(null)
      await loadScripts()
      await queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
    },
    onError: error => {
      console.error('Failed to recycle scripts:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to recycle scripts',
        life: 3000,
      })
    },
  })

  return {
    createCategoryMutation,
    renameCategoryMutation,
    deleteCategoryMutation,
    moveScriptsToCategoryMutation,
    recycleScriptsMutation,
  }
}
