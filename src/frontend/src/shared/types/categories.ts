/**
 * Sentinel ids for the CategoryTreePanel bucket rows — real category ids are
 * positive, so negatives can never collide.
 */
export const UNASSIGNED_CATEGORY_ID = -1
export const ALL_CATEGORIES_ID = -2

/**
 * True only for ids that reference an actual category — filters out null and
 * the sentinel bucket ids, which must never be sent to the backend as a
 * categoryId (e.g. when uploading into the currently selected category).
 */
export function isRealCategoryId(
  categoryId: number | null | undefined
): categoryId is number {
  return categoryId != null && categoryId > 0
}

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
