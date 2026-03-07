import { type RefObject } from 'react'
import { useMutation } from '@tanstack/react-query'

import {
  createSpriteCategory,
  deleteSpriteCategory,
  softDeleteSprite,
  updateSprite,
  updateSpriteCategory,
} from '@/features/sprite/api/spriteApi'
import { type SpriteCategoryDto, type SpriteDto } from '@/types'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface UseSpriteMutationsOptions {
  categories: SpriteCategoryDto[]
  activeCategoryId: number | null
  setActiveCategoryId: (id: number | null) => void
  setSelectedSpriteIds: (ids: Set<number>) => void
  setContextMenuTarget: (sprite: SpriteDto | null) => void
  setSelectedSprite: (sprite: SpriteDto | null) => void
  setIsEditingSpriteName: (editing: boolean) => void
  resetSpriteRenameForm: (values: { name: string }) => void
  setIsSavingSpriteName: (saving: boolean) => void
  setShowCategoryDialog: (show: boolean) => void
  invalidateSprites: () => Promise<void>
  loadCategories: () => Promise<void>
  showToast: ShowToast
  toast: RefObject<{
    show: (opts: {
      severity: string
      summary: string
      detail: string
      life: number
    }) => void
  } | null>
}

const UNASSIGNED_CATEGORY_ID = -1

export function useSpriteMutations({
  categories,
  activeCategoryId,
  setActiveCategoryId,
  setSelectedSpriteIds,
  setContextMenuTarget,
  setSelectedSprite,
  setIsEditingSpriteName,
  resetSpriteRenameForm,
  setIsSavingSpriteName,
  setShowCategoryDialog,
  invalidateSprites,
  loadCategories,
  toast,
}: UseSpriteMutationsOptions) {
  const saveCategoryMutation = useMutation({
    mutationFn: async (vars: {
      editingCategory: SpriteCategoryDto | null
      name: string
      description?: string
    }): Promise<{ type: 'create' | 'update'; createdId?: number }> => {
      if (vars.editingCategory) {
        await updateSpriteCategory(
          vars.editingCategory.id,
          vars.name,
          vars.description
        )
        return { type: 'update' }
      }
      const created = await createSpriteCategory(vars.name, vars.description)
      return { type: 'create', createdId: created.id }
    },
    onSuccess: async (result, vars) => {
      toast.current?.show({
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
      setShowCategoryDialog(false)
      await loadCategories()
      await invalidateSprites()
    },
    onError: error => {
      console.error('Failed to save category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to save category',
        life: 3000,
      })
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: number) => {
      await deleteSpriteCategory(categoryId)
    },
    onSuccess: async (_data, categoryId) => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Category deleted successfully',
        life: 3000,
      })
      if (activeCategoryId === categoryId) {
        setActiveCategoryId(UNASSIGNED_CATEGORY_ID)
      }
      await loadCategories()
      await invalidateSprites()
    },
    onError: error => {
      console.error('Failed to delete category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete category',
        life: 3000,
      })
    },
  })

  const moveSpritesToCategoryMutation = useMutation({
    mutationFn: async (vars: {
      spriteIds: number[]
      categoryId: number | null
    }) => {
      await Promise.all(
        vars.spriteIds.map(id =>
          updateSprite(id, { categoryId: vars.categoryId })
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
        vars.spriteIds.length === 1
          ? `Sprite moved to ${targetCategoryName}`
          : `${vars.spriteIds.length} sprites moved to ${targetCategoryName}`
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: message,
        life: 3000,
      })
      setSelectedSpriteIds(new Set())
      await invalidateSprites()
    },
    onError: error => {
      console.error('Failed to update sprite category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update sprite category',
        life: 3000,
      })
    },
  })

  const recycleSpritesMutation = useMutation({
    mutationFn: async (spriteIds: number[]) => {
      await Promise.all(spriteIds.map(id => softDeleteSprite(id)))
    },
    onSuccess: async (_data, spriteIds) => {
      toast.current?.show({
        severity: 'success',
        summary: 'Recycled',
        detail:
          spriteIds.length > 1
            ? `${spriteIds.length} sprites moved to recycle bin`
            : 'Sprite moved to recycle bin',
        life: 3000,
      })
      setSelectedSpriteIds(new Set())
      setContextMenuTarget(null)
      await invalidateSprites()
    },
    onError: error => {
      console.error('Failed to recycle sprites:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to recycle sprites',
        life: 3000,
      })
    },
  })

  const renameSpriteMutation = useMutation({
    mutationFn: async (vars: { sprite: SpriteDto; newName: string }) => {
      await updateSprite(vars.sprite.id, { name: vars.newName })
    },
    onSuccess: (_data, vars) => {
      setSelectedSprite({ ...vars.sprite, name: vars.newName })
      invalidateSprites()
      setIsEditingSpriteName(false)
      toast.current?.show({
        severity: 'success',
        summary: 'Updated',
        detail: `Sprite renamed to "${vars.newName}"`,
        life: 3000,
      })
    },
    onError: (error, vars) => {
      console.error('Failed to rename sprite:', error)
      resetSpriteRenameForm({ name: vars.sprite.name })
      setIsEditingSpriteName(false)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to rename sprite',
        life: 3000,
      })
    },
    onSettled: () => {
      setIsSavingSpriteName(false)
    },
  })

  return {
    saveCategoryMutation,
    deleteCategoryMutation,
    moveSpritesToCategoryMutation,
    recycleSpritesMutation,
    renameSpriteMutation,
  }
}
