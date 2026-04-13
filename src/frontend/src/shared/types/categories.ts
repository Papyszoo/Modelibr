export interface HierarchicalCategory {
  id: number
  name: string
  description?: string | null
  parentId?: number | null
  path: string
}

export interface CategorySelectionState {
  checked?: boolean
  partialChecked?: boolean
}

export type CategorySelectionKeys = Record<string, CategorySelectionState>
