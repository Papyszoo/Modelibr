import { type QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'

import { client } from '@/lib/apiBase'
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/renderWithProviders'

import { useModelData } from '../useModelData'

const mockGet = client.get as jest.Mock

const baseProps = {
  effectivePackIds: [],
  effectiveProjectIds: [],
  selectedCategoryIds: [],
  selectedTagNames: [],
  hasConceptImages: false,
}

/** Resolve the dependent filter-option queries with empty data. */
function stubFilterOptionQueries(url: string) {
  if (url.startsWith('/packs')) return { data: { packs: [] } }
  if (url.startsWith('/projects')) return { data: { projects: [] } }
  if (url.startsWith('/model-categories')) return { data: { categories: [] } }
  if (url.startsWith('/model-tags')) return { data: { tags: [] } }
  return null
}

function modelPage(items: unknown[], totalCount: number) {
  return { data: { items, totalCount, totalPages: Math.ceil(totalCount / 50) } }
}

function makeModels(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i }))
}

let queryClient: QueryClient
let wrapper: ReturnType<typeof createQueryWrapper>

beforeEach(() => {
  jest.clearAllMocks()
  queryClient = createTestQueryClient()
  wrapper = createQueryWrapper(queryClient)
})

/** The last `/models?...` URL that the hook fired through the api layer. */
function lastModelsUrl(): string {
  const call = mockGet.mock.calls
    .map(c => c[0] as string)
    .reverse()
    .find(u => u.startsWith('/models'))
  return call ?? ''
}

describe('useModelData pagination', () => {
  it('accumulates pages and stops when everything is loaded', async () => {
    mockGet.mockImplementation((url: string) => {
      const stub = stubFilterOptionQueries(url)
      if (stub) return Promise.resolve(stub)
      // page 2 when the request asks for it, otherwise page 1.
      if (url.includes('page=2')) {
        return Promise.resolve(modelPage(makeModels(51, 60), 60))
      }
      return Promise.resolve(modelPage(makeModels(1, 50), 60))
    })

    const { result } = renderHook(() => useModelData(baseProps), { wrapper })

    await waitFor(() => expect(result.current.models).toHaveLength(50))
    expect(result.current.pagination.hasMore).toBe(true)
    expect(result.current.pagination.totalCount).toBe(60)

    await act(async () => {
      await result.current.fetchModels(true)
    })

    await waitFor(() => expect(result.current.models).toHaveLength(60))
    expect(result.current.pagination.hasMore).toBe(false)
  })
})

describe('useModelData filter → query-param mapping', () => {
  it('omits empty arrays and an off toggle, and sorts id filters for a stable cache key', async () => {
    mockGet.mockImplementation((url: string) => {
      const stub = stubFilterOptionQueries(url)
      if (stub) return Promise.resolve(stub)
      return Promise.resolve(modelPage([], 0))
    })

    renderHook(
      () =>
        useModelData({
          ...baseProps,
          effectivePackIds: [3, 1], // intentionally unsorted
          hasConceptImages: false, // an OFF toggle must not become a filter
        }),
      { wrapper }
    )

    await waitFor(() => expect(lastModelsUrl()).not.toBe(''))
    const url = lastModelsUrl()
    // Sorted → packIds=1 appears before packIds=3.
    expect(url.indexOf('packIds=1')).toBeLessThan(url.indexOf('packIds=3'))
    // OFF boolean and unused filters are dropped entirely.
    expect(url).not.toContain('hasConceptImages')
    expect(url).not.toContain('projectIds')
    expect(url).not.toContain('tag=')
  })

  it('sends hasConceptImages only when the toggle is on', async () => {
    mockGet.mockImplementation((url: string) => {
      const stub = stubFilterOptionQueries(url)
      if (stub) return Promise.resolve(stub)
      return Promise.resolve(modelPage([], 0))
    })

    renderHook(() => useModelData({ ...baseProps, hasConceptImages: true }), {
      wrapper,
    })

    await waitFor(() =>
      expect(lastModelsUrl()).toContain('hasConceptImages=true')
    )
  })
})
