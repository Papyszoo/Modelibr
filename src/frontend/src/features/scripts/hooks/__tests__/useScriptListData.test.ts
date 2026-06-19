import { type QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'

import { client } from '@/lib/apiBase'
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/renderWithProviders'

import { useScriptListData } from '../useScriptListData'

const mockGet = client.get as jest.Mock
const noop = () => {}

function scriptPage(scripts: unknown[], totalCount: number) {
  return {
    data: {
      scripts,
      totalCount,
      page: 1,
      pageSize: 50,
      totalPages: Math.ceil(totalCount / 50),
    },
  }
}

function makeScripts(
  from: number,
  to: number,
  categoryId: number | null = null
) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    id: from + i,
    categoryId,
    language: 'lua',
  }))
}

let queryClient: QueryClient
let wrapper: ReturnType<typeof createQueryWrapper>

beforeEach(() => {
  jest.clearAllMocks()
  queryClient = createTestQueryClient()
  wrapper = createQueryWrapper(queryClient)
})

describe('useScriptListData pagination', () => {
  it('loads the first page, then appends the next until everything is loaded', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/script-categories')) {
        return Promise.resolve({ data: { categories: [] } })
      }
      if (url.includes('page=2')) {
        return Promise.resolve(scriptPage(makeScripts(51, 60), 60))
      }
      return Promise.resolve(scriptPage(makeScripts(1, 50), 60))
    })

    const { result } = renderHook(() => useScriptListData(noop), { wrapper })

    await waitFor(() => expect(result.current.scripts).toHaveLength(50))
    expect(result.current.hasNextPage).toBe(true)
    expect(result.current.totalCount).toBe(60)

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.scripts).toHaveLength(60))
    expect(result.current.hasNextPage).toBe(false)
  })
})

describe('useScriptListData client-side category filter', () => {
  it('shows only uncategorized scripts by default, then narrows to a chosen category', async () => {
    const scripts = [
      ...makeScripts(1, 2, null), // uncategorized
      ...makeScripts(3, 3, 5), // in category 5
    ]
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/script-categories')) {
        return Promise.resolve({ data: { categories: [] } })
      }
      return Promise.resolve(scriptPage(scripts, scripts.length))
    })

    const { result } = renderHook(() => useScriptListData(noop), { wrapper })

    await waitFor(() => expect(result.current.scripts).toHaveLength(3))
    // Default view (Uncategorized) → only the two null-category scripts.
    expect(result.current.filteredScripts.map(s => s.id)).toEqual([1, 2])

    act(() => result.current.setActiveCategoryId(5))
    await waitFor(() =>
      expect(result.current.filteredScripts.map(s => s.id)).toEqual([3])
    )
  })
})
