import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type RefObject } from 'react'

import {
  createSpriteCategory,
  deleteSpriteCategory,
  softDeleteSprite,
  updateSprite,
  updateSpriteCategory,
} from '@/features/sprite/api/spriteApi'
import { ALL_CATEGORIES_ID } from '@/shared/types/categories'
import { collectCategoryBranchIds } from '@/shared/utils/categoryTree'
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
  invalidateSprites,
  loadCategories,
  toast,
}: UseSpriteMutationsOptions) {
  const queryClient = useQueryClient()
  const createCategoryMutation = useMutation({
    mutationFn: async (vars: { name: string; parentId: number | null }) =>
      createSpriteCategory(vars.name, undefined, vars.parentId),
    onSuccess: async created => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Category created successfully',
        life: 3000,
      })
      setActiveCategoryId(created.id)
      await loadCategories()
      await invalidateSprites()
    },
    onError: error => {
      console.error('Failed to create category:', error)
      toast.current?.show({
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
    mutationFn: async (vars: { category: SpriteCategoryDto; name: string }) =>
      updateSpriteCategory(
        vars.category.id,
        vars.name,
        vars.category.description ?? undefined,
        vars.category.parentId ?? null
      ),
    onSuccess: async () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Category renamed successfully',
        life: 3000,
      })
      await loadCategories()
      await invalidateSprites()
    },
    onError: error => {
      console.error('Failed to rename category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to rename category',
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
      // Deleting removes the whole branch, so a selection anywhere inside
      // it (not just the deleted node) must fall back to "All".
      const deletedBranch = collectCategoryBranchIds(categories, categoryId)
      if (activeCategoryId !== null && deletedBranch.has(activeCategoryId)) {
        setActiveCategoryId(ALL_CATEGORIES_ID)
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
      await queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
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
      await updateSprite(vars.sprite.id, {
        name: vars.newName,
        spriteType: vars.sprite.spriteType,
        categoryId: vars.sprite.categoryId,
      })
    },
    onSuccess: async (_data, vars) => {
      setSelectedSprite({ ...vars.sprite, name: vars.newName })
      await invalidateSprites()
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
    createCategoryMutation,
    renameCategoryMutation,
    deleteCategoryMutation,
    moveSpritesToCategoryMutation,
    recycleSpritesMutation,
    renameSpriteMutation,
  }
}
