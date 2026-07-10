import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createSoundCategory,
  deleteSoundCategory,
  softDeleteSound,
  updateSound,
  updateSoundCategory,
} from '@/features/sounds/api/soundApi'
import { useCategoryMutations } from '@/shared/hooks/useCategoryMutations'
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

  const {
    createCategoryMutation,
    renameCategoryMutation,
    deleteCategoryMutation,
    moveToCategoryMutation,
  } = useCategoryMutations<
    SoundCategoryDto,
    { id: number },
    { soundIds: number[]; categoryId: number | null }
  >({
    showToast,
    categories,
    activeCategoryId,
    setActiveCategoryId,
    clearSelection: () => setSelectedSoundIds(new Set()),
    noun: 'sound',
    // Sounds refetch imperatively rather than via query-key invalidation.
    onCategoriesChanged: async () => {
      await loadCategories()
      await loadSounds()
    },
    onAssetsChanged: loadSounds,
    createCategory: vars =>
      createSoundCategory(vars.name, undefined, vars.parentId),
    renameCategory: vars =>
      updateSoundCategory(
        vars.category.id,
        vars.name,
        vars.category.description ?? undefined,
        vars.category.parentId ?? null
      ),
    deleteCategory: deleteSoundCategory,
    moveToCategory: async vars => {
      await Promise.all(
        vars.soundIds.map(id =>
          updateSound(id, { categoryId: vars.categoryId })
        )
      )
      return vars.soundIds.length
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
    moveSoundsToCategoryMutation: moveToCategoryMutation,
    recycleSoundsMutation,
  }
}
