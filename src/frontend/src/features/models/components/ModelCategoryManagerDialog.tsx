import {
  createModelCategory,
  deleteModelCategory,
  updateModelCategory,
} from '@/features/models/api/modelApi'
import { type ModelCategoryDto } from '@/types'
import { CategoryManagerDialog } from '@/shared/components/categories/CategoryManagerDialog'
import { useQueryClient } from '@tanstack/react-query'

interface ModelCategoryManagerDialogProps {
  visible: boolean
  categories: ModelCategoryDto[]
  onHide: () => void
}

export function ModelCategoryManagerDialog({
  visible,
  categories,
  onHide,
}: ModelCategoryManagerDialogProps) {
  const queryClient = useQueryClient()

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['model-categories'] }),
      queryClient.invalidateQueries({ queryKey: ['models'] }),
    ])
  }

  return (
    <CategoryManagerDialog
      title="Manage Model Categories"
      visible={visible}
      categories={categories}
      onHide={onHide}
      createLabel="Create Category"
      createCategory={async request => {
        const created = await createModelCategory(request)
        await invalidate()
        return created
      }}
      updateCategory={async (id, request) => {
        await updateModelCategory(id, request)
        await invalidate()
      }}
      deleteCategory={async id => {
        await deleteModelCategory(id)
        await invalidate()
      }}
    />
  )
}
