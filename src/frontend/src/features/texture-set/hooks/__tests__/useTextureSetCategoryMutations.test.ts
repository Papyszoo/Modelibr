import { renderHook, waitFor } from '@testing-library/react'

import { ALL_CATEGORIES_ID } from '@/shared/types/categories'
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/renderWithProviders'
import { type TextureSetDto, TextureSetKind } from '@/types'

import { useTextureSetCategoryMutations } from '../useTextureSetCategoryMutations'

jest.mock('@/features/texture-set/api/textureSetApi', () => ({
  createTextureSetCategory: jest.fn().mockResolvedValue({ id: 42 }),
  updateTextureSetCategory: jest.fn().mockResolvedValue(undefined),
  deleteTextureSetCategory: jest.fn().mockResolvedValue(undefined),
  updateTextureSet: jest.fn().mockResolvedValue({}),
}))

import {
  createTextureSetCategory,
  updateTextureSet,
  updateTextureSetCategory,
} from '@/features/texture-set/api/textureSetApi'

const categories = [{ id: 1, name: 'Metal', path: 'Metal', parentId: null }]

function setup(categoriesKind: TextureSetKind) {
  const wrapper = createQueryWrapper(createTestQueryClient())
  const { result } = renderHook(
    () =>
      useTextureSetCategoryMutations({
        showToast: jest.fn(),
        categoriesKind,
        activeCategoryId: ALL_CATEGORIES_ID,
        setActiveCategoryId: jest.fn(),
        categories,
        clearSelection: jest.fn(),
      }),
    { wrapper }
  )
  return result
}

beforeEach(() => jest.clearAllMocks())

describe('useTextureSetCategoryMutations', () => {
  it('stamps the active kind onto created categories (per-kind vocabulary)', async () => {
    // Categories are scoped per kind; a create that dropped the kind would land
    // in the wrong (or no) vocabulary.
    const result = setup(TextureSetKind.Universal)
    result.current.createCategoryMutation.mutate({
      name: 'Bricks',
      parentId: null,
    })
    await waitFor(() =>
      expect(createTextureSetCategory).toHaveBeenCalledWith({
        name: 'Bricks',
        parentId: null,
        kind: TextureSetKind.Universal,
      })
    )
  })

  it('rename carries the kind + existing parent through', async () => {
    const result = setup(TextureSetKind.ModelSpecific)
    result.current.renameCategoryMutation.mutate({
      category: categories[0],
      name: 'Metals',
    })
    await waitFor(() =>
      expect(updateTextureSetCategory).toHaveBeenCalledWith(1, {
        name: 'Metals',
        description: undefined,
        parentId: null,
        kind: TextureSetKind.ModelSpecific,
      })
    )
  })

  it('move skips ModelOwned sets (backend rejects them) but moves the rest', async () => {
    const result = setup(TextureSetKind.Universal)
    const sets = [
      { id: 10, name: 'A', kind: TextureSetKind.Universal },
      { id: 11, name: 'B', kind: TextureSetKind.ModelOwned },
    ] as unknown as TextureSetDto[]
    result.current.moveToCategoryMutation.mutate({
      textureSets: sets,
      categoryId: 1,
    })
    await waitFor(() =>
      expect(updateTextureSet).toHaveBeenCalledWith(10, {
        name: 'A',
        categoryId: 1,
      })
    )
    // The ModelOwned set (11) must never be sent.
    expect(updateTextureSet).toHaveBeenCalledTimes(1)
  })
})
