import { useMutation } from '@tanstack/react-query'

import {
  createSoundCategory,
  deleteSoundCategory,
  softDeleteSound,
  updateSound,
  updateSoundCategory,
} from '@/features/sounds/api/soundApi'
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

const UNASSIGNED_CATEGORY_ID = -1

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
  const saveCategoryMutation = useMutation({
    mutationFn: async (vars: {
      editingCategory: SoundCategoryDto | null
      name: string
      description?: string
    }): Promise<{ type: 'create' | 'update'; createdId?: number }> => {
      if (vars.editingCategory) {
        await updateSoundCategory(
          vars.editingCategory.id,
          vars.name,
          vars.description
        )
        return { type: 'update' }
      }

      const created = await createSoundCategory(vars.name, vars.description)
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
      await loadSounds()
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
      await deleteSoundCategory(categoryId)
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
    saveCategoryMutation,
    deleteCategoryMutation,
    moveSoundsToCategoryMutation,
    recycleSoundsMutation,
  }
}
