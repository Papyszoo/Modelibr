import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type RefObject } from 'react'

import {
  createSpriteCategory,
  deleteSpriteCategory,
  softDeleteSprite,
  updateSprite,
  updateSpriteCategory,
} from '@/features/sprite/api/spriteApi'
import { useCategoryMutations } from '@/shared/hooks/useCategoryMutations'
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

  const showToast: ShowToast = opts => toast.current?.show(opts)

  const {
    createCategoryMutation,
    renameCategoryMutation,
    deleteCategoryMutation,
    moveToCategoryMutation,
  } = useCategoryMutations<
    SpriteCategoryDto,
    { id: number },
    { spriteIds: number[]; categoryId: number | null }
  >({
    showToast,
    categories,
    activeCategoryId,
    setActiveCategoryId,
    clearSelection: () => setSelectedSpriteIds(new Set()),
    noun: 'sprite',
    // Sprites refetch imperatively rather than via query-key invalidation.
    onCategoriesChanged: async () => {
      await loadCategories()
      await invalidateSprites()
    },
    onAssetsChanged: invalidateSprites,
    createCategory: vars =>
      createSpriteCategory(vars.name, undefined, vars.parentId),
    renameCategory: vars =>
      updateSpriteCategory(
        vars.category.id,
        vars.name,
        vars.category.description ?? undefined,
        vars.category.parentId ?? null
      ),
    deleteCategory: deleteSpriteCategory,
    moveToCategory: async vars => {
      await Promise.all(
        vars.spriteIds.map(id =>
          updateSprite(id, { categoryId: vars.categoryId })
        )
      )
      return vars.spriteIds.length
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
    moveSpritesToCategoryMutation: moveToCategoryMutation,
    recycleSpritesMutation,
    renameSpriteMutation,
  }
}
