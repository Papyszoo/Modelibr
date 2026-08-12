import { useQueryClient } from '@tanstack/react-query'

import {
  createTextureSetCategory,
  deleteTextureSetCategory,
  updateTextureSet,
  updateTextureSetCategory,
} from '@/features/texture-set/api/textureSetApi'
import { useCategoryMutations } from '@/shared/hooks/useCategoryMutations'
import {
  type TextureSetCategoryDto,
  type TextureSetDto,
  TextureSetKind,
} from '@/types'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface UseTextureSetCategoryMutationsOptions {
  showToast: ShowToast
  /** Kind the visible categories belong to - categories are scoped per kind. */
  categoriesKind: TextureSetKind
  activeCategoryId: number | null
  setActiveCategoryId: (id: number | null) => void
  categories: TextureSetCategoryDto[]
  clearSelection: () => void
}

export function useTextureSetCategoryMutations({
  showToast,
  categoriesKind,
  activeCategoryId,
  setActiveCategoryId,
  categories,
  clearSelection,
}: UseTextureSetCategoryMutationsOptions) {
  const queryClient = useQueryClient()

  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: ['textureSetCategories'] })
  const invalidateTextureSets = () =>
    queryClient.invalidateQueries({ queryKey: ['textureSets'] })

  return useCategoryMutations<
    TextureSetCategoryDto,
    TextureSetCategoryDto,
    { textureSets: TextureSetDto[]; categoryId: number | null }
  >({
    showToast,
    categories,
    activeCategoryId,
    setActiveCategoryId,
    clearSelection,
    noun: 'texture set',
    onCategoriesChanged: async () => {
      await Promise.all([invalidateCategories(), invalidateTextureSets()])
    },
    onAssetsChanged: invalidateTextureSets,
    // Categories are scoped per kind - stamp the visible kind onto create/rename.
    createCategory: vars =>
      createTextureSetCategory({
        name: vars.name,
        parentId: vars.parentId ?? null,
        kind: categoriesKind,
      }),
    renameCategory: vars =>
      updateTextureSetCategory(vars.category.id, {
        name: vars.name,
        description: vars.category.description ?? undefined,
        parentId: vars.category.parentId ?? null,
        kind: categoriesKind,
      }),
    deleteCategory: deleteTextureSetCategory,
    moveToCategory: async vars => {
      // ModelOwned sets don't participate in the shared category system; the
      // backend would reject them with CategoryKindMismatch. Skip them, and
      // report the count actually moved.
      const eligible = vars.textureSets.filter(
        set => set.kind !== TextureSetKind.ModelOwned
      )
      await Promise.all(
        eligible.map(set =>
          updateTextureSet(set.id, {
            name: set.name,
            categoryId: vars.categoryId,
          })
        )
      )
      return eligible.length
    },
  })
}
