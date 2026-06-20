import { useQueryClient } from '@tanstack/react-query'

import {
  createScriptCategory,
  deleteScriptCategory,
  updateScriptCategory,
} from '@/features/scripts/api/scriptApi'
import { CategoryManagerDialog } from '@/shared/components/categories/CategoryManagerDialog'
import { type ScriptCategoryDto } from '@/types'

interface ScriptCategoryManagerDialogProps {
  visible: boolean
  categories: ScriptCategoryDto[]
  onHide: () => void
}

/**
 * Manage script categories (create / rename / re-parent / delete) using the
 * shared hierarchical category manager — the same UX as Models.
 */
export function ScriptCategoryManagerDialog({
  visible,
  categories,
  onHide,
}: ScriptCategoryManagerDialogProps) {
  const queryClient = useQueryClient()

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['scriptCategories'] }),
      queryClient.invalidateQueries({ queryKey: ['scripts'] }),
    ])
  }

  return (
    <CategoryManagerDialog
      title="Manage Script Categories"
      visible={visible}
      categories={categories}
      onHide={onHide}
      createLabel="Create Category"
      createCategory={async request => {
        const created = await createScriptCategory(
          request.name,
          request.description,
          request.parentId
        )
        await invalidate()
        return created
      }}
      updateCategory={async (id, request) => {
        await updateScriptCategory(
          id,
          request.name,
          request.description,
          request.parentId
        )
        await invalidate()
      }}
      deleteCategory={async id => {
        await deleteScriptCategory(id)
        await invalidate()
      }}
    />
  )
}
