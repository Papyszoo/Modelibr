import { renderHook, waitFor } from '@testing-library/react'

import {
  ALL_CATEGORIES_ID,
  UNASSIGNED_CATEGORY_ID,
} from '@/shared/types/categories'
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/renderWithProviders'
import { type Model } from '@/utils/fileUtils'

import { useModelCategoryMutations } from '../useModelCategoryMutations'

// Mock the API layer - these tests assert the request the hook constructs,
// which is where the real regressions live (dropped parentId, wiped tags).
jest.mock('@/features/models/api/modelApi', () => ({
  createModelCategory: jest.fn().mockResolvedValue({ id: 99 }),
  updateModelCategory: jest.fn().mockResolvedValue(undefined),
  deleteModelCategory: jest.fn().mockResolvedValue(undefined),
  updateModelTags: jest.fn().mockResolvedValue({}),
}))

import {
  createModelCategory,
  deleteModelCategory,
  updateModelCategory,
  updateModelTags,
} from '@/features/models/api/modelApi'

const categories = [
  { id: 1, name: 'Characters', path: 'Characters', parentId: null },
  { id: 2, name: 'Humanoid', path: 'Characters / Humanoid', parentId: 1 },
]

function setup(
  overrides: {
    activeCategoryId?: number | null
    setActiveCategoryId?: (id: number | null) => void
    clearSelection?: () => void
  } = {}
) {
  const wrapper = createQueryWrapper(createTestQueryClient())
  const setActiveCategoryId = overrides.setActiveCategoryId ?? jest.fn()
  const clearSelection = overrides.clearSelection ?? jest.fn()
  const { result } = renderHook(
    () =>
      useModelCategoryMutations({
        showToast: jest.fn(),
        activeCategoryId: overrides.activeCategoryId ?? ALL_CATEGORIES_ID,
        setActiveCategoryId,
        categories,
        clearSelection,
      }),
    { wrapper }
  )
  return { result, setActiveCategoryId, clearSelection }
}

beforeEach(() => jest.clearAllMocks())

describe('useModelCategoryMutations', () => {
  it('creates a category with its parentId (subcategory support)', async () => {
    const { result } = setup()
    result.current.createCategoryMutation.mutate({ name: 'Props', parentId: 1 })
    await waitFor(() =>
      expect(createModelCategory).toHaveBeenCalledWith({
        name: 'Props',
        parentId: 1,
      })
    )
  })

  it('rename passes the existing parentId through so it is not re-rooted', async () => {
    const { result } = setup()
    // Renaming the child category (parentId=1) must keep parentId=1 - omitting
    // it would move the category to the root.
    result.current.renameCategoryMutation.mutate({
      category: categories[1],
      name: 'Bipedal',
    })
    await waitFor(() =>
      expect(updateModelCategory).toHaveBeenCalledWith(2, {
        name: 'Bipedal',
        description: undefined,
        parentId: 1,
      })
    )
  })

  it('move preserves each model tags + description (no wipe on category change)', async () => {
    const { result, clearSelection } = setup()
    const models = [
      { id: 7, name: 'Knight', tags: ['hero'], description: 'a knight' },
    ] as unknown as Model[]
    result.current.moveToCategoryMutation.mutate({ models, categoryId: 2 })
    await waitFor(() =>
      expect(updateModelTags).toHaveBeenCalledWith('7', ['hero'], 'a knight', 2)
    )
    await waitFor(() => expect(clearSelection).toHaveBeenCalled())
  })

  it('delete falls back to All when the active selection is inside the deleted branch', async () => {
    // Active = child (2); deleting the parent (1) removes the whole branch, so
    // the active selection must reset to All.
    const setActiveCategoryId = jest.fn()
    const { result } = setup({ activeCategoryId: 2, setActiveCategoryId })
    result.current.deleteCategoryMutation.mutate(1)
    await waitFor(() => expect(deleteModelCategory).toHaveBeenCalledWith(1))
    await waitFor(() =>
      expect(setActiveCategoryId).toHaveBeenCalledWith(ALL_CATEGORIES_ID)
    )
  })

  it('delete keeps the active selection when it is outside the deleted branch', async () => {
    const setActiveCategoryId = jest.fn()
    // Active = Unassigned; deleting category 2 must not touch the selection.
    const { result } = setup({
      activeCategoryId: UNASSIGNED_CATEGORY_ID,
      setActiveCategoryId,
    })
    result.current.deleteCategoryMutation.mutate(2)
    await waitFor(() => expect(deleteModelCategory).toHaveBeenCalledWith(2))
    expect(setActiveCategoryId).not.toHaveBeenCalled()
  })
})
