import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createScriptCategory,
  deleteScriptCategory,
  softDeleteScript,
  updateScript,
  updateScriptCategory,
} from '@/features/scripts/api/scriptApi'
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

const UNASSIGNED_CATEGORY_ID = -1

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
  const saveCategoryMutation = useMutation({
    mutationFn: async (vars: {
      editingCategory: ScriptCategoryDto | null
      name: string
      description?: string
    }): Promise<{ type: 'create' | 'update'; createdId?: number }> => {
      if (vars.editingCategory) {
        await updateScriptCategory(
          vars.editingCategory.id,
          vars.name,
          vars.description
        )
        return { type: 'update' }
      }

      const created = await createScriptCategory(vars.name, vars.description)
      return { type: 'create', createdId: created.id }
    },
    onSuccess: async (result, vars) => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: vars.editingCategory
          ? 'Category updated successfully'
          : 'Category created successfully',
        life: 3000,
      })

      if (result.type === 'create' && typeof result.createdId === 'number') {
        setActiveCategoryId(result.createdId)
      }

      await loadCategories()
      await loadScripts()
    },
    onError: error => {
      console.error('Failed to save category:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to save category',
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
      if (activeCategoryId === categoryId) {
        setActiveCategoryId(UNASSIGNED_CATEGORY_ID)
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
    saveCategoryMutation,
    deleteCategoryMutation,
    moveScriptsToCategoryMutation,
    recycleScriptsMutation,
  }
}
