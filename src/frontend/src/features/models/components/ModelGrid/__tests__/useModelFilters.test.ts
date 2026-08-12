import { act, renderHook } from '@testing-library/react'

import { ALL_CATEGORIES_ID } from '@/shared/types/categories'
import { type Model } from '@/utils/fileUtils'

import { useModelFilters } from '../useModelFilters'

const models = [
  { id: 1, name: 'Knight', categoryId: 5 },
  { id: 2, name: 'Goblin', categoryId: 5 },
  { id: 3, name: 'Rock', categoryId: 9 },
  { id: 4, name: 'Loose', categoryId: null },
] as unknown as Model[]

// Category scoping moved server-side (useModelData passes categoryIds/
// uncategorized). filterModels is now a name-search-only client overlay.
describe('useModelFilters - client name search only', () => {
  it('returns every model when the search is empty', () => {
    const { result } = renderHook(() => useModelFilters({}))
    expect(result.current.activeCategoryId).toBe(ALL_CATEGORIES_ID)
    expect(result.current.filterModels(models)).toHaveLength(4)
  })

  it('filters by name (case-insensitive substring)', () => {
    const { result } = renderHook(() => useModelFilters({}))
    act(() => result.current.setSearchQuery('gob'))
    expect(result.current.filterModels(models).map(m => m.id)).toEqual([2])
  })

  // Regression: the server already scopes by category, so re-applying a
  // category filter here would hide server-returned rows (e.g. show nothing
  // for a category whose members aren't on the loaded pages). Selecting a
  // category must NOT change filterModels' output.
  it('does not re-filter by the active category', () => {
    const { result } = renderHook(() => useModelFilters({}))
    act(() => result.current.setActiveCategoryId(9))
    // All four models pass through untouched despite category 9 being active.
    expect(result.current.filterModels(models)).toHaveLength(4)
  })
})
