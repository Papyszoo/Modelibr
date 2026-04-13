import { CategoryFilterPicker } from '@/shared/components/categories/CategoryFilterPicker'
import { type CategorySelectionKeys } from '@/shared/types/categories'
import { type ModelCategoryDto } from '@/types'

interface ModelCategoryFilterPickerProps {
  categories: ModelCategoryDto[]
  selectedKeys: CategorySelectionKeys
  onChange: (keys: CategorySelectionKeys) => void
  onManageClick: () => void
  disabled?: boolean
}

export function ModelCategoryFilterPicker(
  props: ModelCategoryFilterPickerProps
) {
  return (
    <CategoryFilterPicker
      {...props}
      label="Categories"
      ariaLabel="Filter by model categories"
    />
  )
}
