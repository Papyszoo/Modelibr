import { CategorySinglePicker } from '@/shared/components/categories/CategorySinglePicker'
import { type ModelCategoryDto } from '@/types'

interface ModelCategorySinglePickerProps {
  categories: ModelCategoryDto[]
  selectedCategoryId?: number | null
  placeholder?: string
  onChange: (categoryId: number | null) => void
}

export function ModelCategorySinglePicker(
  props: ModelCategorySinglePickerProps
) {
  return <CategorySinglePicker {...props} ariaLabel="Select model category" />
}
