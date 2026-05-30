import { useQueryClient } from '@tanstack/react-query'

import {
  createTextureSetCategory,
  deleteTextureSetCategory,
  updateTextureSetCategory,
} from '@/features/texture-set/api/textureSetApi'
import { CategoryManagerDialog } from '@/shared/components/categories/CategoryManagerDialog'
import { type TextureSetCategoryDto, type TextureSetKind } from '@/types'

interface TextureSetCategoryManagerDialogProps {
  visible: boolean
  categories: TextureSetCategoryDto[]
  kind: TextureSetKind
  onHide: () => void
}

export function TextureSetCategoryManagerDialog({
  visible,
  categories,
  kind,
  onHide,
}: TextureSetCategoryManagerDialogProps) {
  const queryClient = useQueryClient()

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['textureSetCategories', kind],
      }),
      queryClient.invalidateQueries({ queryKey: ['textureSets'] }),
    ])
  }

  return (
    <CategoryManagerDialog
      title="Manage Categories"
      visible={visible}
      categories={categories}
      onHide={onHide}
      createLabel="Create Category"
      createCategory={async request => {
        const created = await createTextureSetCategory({ ...request, kind })
        await invalidate()
        return created
      }}
      updateCategory={async (id, request) => {
        await updateTextureSetCategory(id, { ...request, kind })
        await invalidate()
      }}
      deleteCategory={async id => {
        await deleteTextureSetCategory(id)
        await invalidate()
      }}
    />
  )
}
