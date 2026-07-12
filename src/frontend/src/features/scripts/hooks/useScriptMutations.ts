import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createScriptCategory,
  deleteScriptCategory,
  softDeleteScript,
  updateScript,
  updateScriptCategory,
} from '@/features/scripts/api/scriptApi'
import { useCategoryMutations } from '@/shared/hooks/useCategoryMutations'
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

  const {
    createCategoryMutation,
    renameCategoryMutation,
    deleteCategoryMutation,
    moveToCategoryMutation,
  } = useCategoryMutations<
    ScriptCategoryDto,
    { id: number },
    { scriptIds: number[]; categoryId: number | null }
  >({
    showToast,
    categories,
    activeCategoryId,
    setActiveCategoryId,
    clearSelection: () => setSelectedScriptIds(new Set()),
    noun: 'script',
    // Scripts refetch imperatively rather than via query-key invalidation.
    onCategoriesChanged: async () => {
      await loadCategories()
      await loadScripts()
    },
    onAssetsChanged: loadScripts,
    createCategory: vars =>
      createScriptCategory(vars.name, undefined, vars.parentId),
    renameCategory: vars =>
      updateScriptCategory(
        vars.category.id,
        vars.name,
        vars.category.description ?? undefined,
        vars.category.parentId ?? null
      ),
    deleteCategory: deleteScriptCategory,
    moveToCategory: async vars => {
      await Promise.all(
        vars.scriptIds.map(id =>
          updateScript(id, { categoryId: vars.categoryId })
        )
      )
      return vars.scriptIds.length
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
    moveScriptsToCategoryMutation: moveToCategoryMutation,
    recycleScriptsMutation,
  }
}
