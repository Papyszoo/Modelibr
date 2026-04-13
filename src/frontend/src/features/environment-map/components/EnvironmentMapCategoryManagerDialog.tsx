import { useQueryClient } from '@tanstack/react-query'

import {
  createEnvironmentMapCategory,
  deleteEnvironmentMapCategory,
  updateEnvironmentMapCategory,
} from '@/features/environment-map/api/environmentMapCategoryApi'
import { CategoryManagerDialog } from '@/shared/components/categories/CategoryManagerDialog'
import { type EnvironmentMapCategoryDto } from '@/types'

interface EnvironmentMapCategoryManagerDialogProps {
  visible: boolean
  categories: EnvironmentMapCategoryDto[]
  onHide: () => void
}

export function EnvironmentMapCategoryManagerDialog({
  visible,
  categories,
  onHide,
}: EnvironmentMapCategoryManagerDialogProps) {
  const queryClient = useQueryClient()

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['environment-map-categories'],
      }),
      queryClient.invalidateQueries({ queryKey: ['environmentMaps'] }),
    ])
  }

  return (
    <CategoryManagerDialog
      title="Manage Environment Map Categories"
      visible={visible}
      categories={categories}
      onHide={onHide}
      createLabel="Create Category"
      createCategory={async request => {
        const created = await createEnvironmentMapCategory(request)
        await invalidate()
        return created
      }}
      updateCategory={async (id, request) => {
        await updateEnvironmentMapCategory(id, request)
        await invalidate()
      }}
      deleteCategory={async id => {
        await deleteEnvironmentMapCategory(id)
        await invalidate()
      }}
    />
  )
}
