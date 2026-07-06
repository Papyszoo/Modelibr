import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createSoundCategory,
  deleteSoundCategory,
  softDeleteSound,
  updateSound,
  updateSoundCategory,
} from '@/features/sounds/api/soundApi'
import { ALL_CATEGORIES_ID } from '@/shared/types/categories'
import { collectCategoryBranchIds } from '@/shared/utils/categoryTree'
import { type SoundCategoryDto } from '@/types'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface UseSoundMutationsOptions {
  showToast: ShowToast
  loadSounds: () => Promise<void>
  loadCategories: () => Promise<void>
  activeCategoryId: number | null
  setActiveCategoryId: (id: number | null) => void
  categories: SoundCategoryDto[]
  setSelectedSoundIds: (ids: Set<number>) => void
  setContextMenuTarget: (target: null) => void
}

export function useSoundMutations({
  showToast,
  loadSounds,
  loadCategories,
  activeCategoryId,
  setActiveCategoryId,
  categories,
  setSelectedSoundIds,
  setContextMenuTarget,
}: UseSoundMutationsOptions) {
  const queryClient = useQueryClient()
  const createCategoryMutation = useMutation({
    mutationFn: async (vars: { name: string; parentId: number | null }) =>
      createSoundCategory(vars.name, undefined, vars.parentId),
    onSuccess: async created => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: 'Category created successfully',
        life: 3000,
      })
      setActiveCategoryId(created.id)
      await loadCategories()
      await loadSounds()
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
    mutationFn: async (vars: { category: SoundCategoryDto; name: string }) =>
      updateSoundCategory(
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
      await loadSounds()
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
      await deleteSoundCategory(categoryId)
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
      await loadSounds()
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

  const moveSoundsToCategoryMutation = useMutation({
    mutationFn: async (vars: {
      soundIds: number[]
      categoryId: number | null
    }) => {
      await Promise.all(
        vars.soundIds.map(id =>
          updateSound(id, { categoryId: vars.categoryId })
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
        vars.soundIds.length === 1
          ? `Sound moved to ${targetCategoryName}`
          : `${vars.soundIds.length} sounds moved to ${targetCategoryName}`

      showToast({
        severity: 'success',
        summary: 'Success',
        detail: message,
        life: 3000,
      })
      setSelectedSoundIds(new Set())
      await loadSounds()
    },
    onError: error => {
      console.error('Failed to update sound category:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update sound category',
        life: 3000,
      })
    },
  })

  const recycleSoundsMutation = useMutation({
    mutationFn: async (soundIds: number[]) => {
      await Promise.all(soundIds.map(id => softDeleteSound(id)))
    },
    onSuccess: async (_data, soundIds) => {
      showToast({
        severity: 'success',
        summary: 'Recycled',
        detail:
          soundIds.length > 1
            ? `${soundIds.length} sounds moved to recycle bin`
            : 'Sound moved to recycle bin',
        life: 3000,
      })
      setSelectedSoundIds(new Set())
      setContextMenuTarget(null)
      await loadSounds()
      await queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
    },
    onError: error => {
      console.error('Failed to recycle sounds:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to recycle sounds',
        life: 3000,
      })
    },
  })

  return {
    createCategoryMutation,
    renameCategoryMutation,
    deleteCategoryMutation,
    moveSoundsToCategoryMutation,
    recycleSoundsMutation,
  }
}
