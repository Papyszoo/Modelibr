import { act, renderHook } from '@testing-library/react'

import { createScriptWithFile } from '@/features/scripts/api/scriptApi'
import {
  ALL_CATEGORIES_ID,
  UNASSIGNED_CATEGORY_ID,
} from '@/shared/types/categories'

import { useScriptUpload } from '../useScriptUpload'

jest.mock('@/features/scripts/api/scriptApi', () => ({
  createScriptWithFile: jest.fn().mockResolvedValue({
    scriptId: 1,
    name: 'test',
    fileId: 2,
  }),
}))

const mockCreateScriptWithFile = createScriptWithFile as jest.Mock

const noop = () => {}
const loadScripts = () => Promise.resolve()

function dropFile(activeCategoryId: number | null) {
  const { result } = renderHook(() =>
    useScriptUpload({ showToast: noop, activeCategoryId, loadScripts })
  )
  const file = new File(['print("hi")'], 'test.lua', { type: 'text/plain' })
  return act(async () => {
    await result.current.handleFileDrop([file])
  })
}

beforeEach(() => {
  mockCreateScriptWithFile.mockClear()
})

describe('useScriptUpload category assignment', () => {
  // Regression: the sidebar's "All" bucket uses the sentinel id -2; the
  // upload hook forwarded it as a real categoryId, so every upload made
  // while "All" was selected (the default view) failed with a backend
  // category-not-found error. Caught by the sounds/sprites e2e setup.
  it('omits categoryId when the All bucket is selected', async () => {
    await dropFile(ALL_CATEGORIES_ID)

    expect(mockCreateScriptWithFile).toHaveBeenCalledTimes(1)
    expect(mockCreateScriptWithFile.mock.calls[0][1]).toEqual({
      name: 'test',
      categoryId: undefined,
    })
  })

  it('omits categoryId for the Unassigned bucket', async () => {
    await dropFile(UNASSIGNED_CATEGORY_ID)

    expect(mockCreateScriptWithFile.mock.calls[0][1].categoryId).toBe(undefined)
  })

  it('forwards a real category id', async () => {
    await dropFile(7)

    expect(mockCreateScriptWithFile.mock.calls[0][1].categoryId).toBe(7)
  })
})
