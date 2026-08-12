/**
 * Sentinel ids for the CategoryTreePanel bucket rows - real category ids are
 * positive, so negatives can never collide.
 */
export const UNASSIGNED_CATEGORY_ID = -1
export const ALL_CATEGORIES_ID = -2

/**
 * True only for ids that reference an actual category - filters out null and
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

/** One category's direct asset count (server-computed true total). */
export interface CategoryCountEntry {
  categoryId: number
  count: number
}

/**
 * True per-category asset totals for one asset type, from the backend
 * `/{type}-categories/counts` endpoint. Drives the sidebar count badges so
 * they show real library totals rather than loaded-page counts.
 */
export interface CategoryCountsResponse {
  categories: CategoryCountEntry[]
  uncategorizedCount: number
  totalCount: number
}

/** Convert the server counts list into the `Map` the sidebar consumes. */
export function toCategoryCountMap(
  response: CategoryCountsResponse | undefined
): Map<number, number> {
  const map = new Map<number, number>()
  for (const entry of response?.categories ?? []) {
    map.set(entry.categoryId, entry.count)
  }
  return map
}
