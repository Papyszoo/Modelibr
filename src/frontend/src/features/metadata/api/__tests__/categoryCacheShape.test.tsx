import { type QueryClient, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

import { useEnvironmentMapCategoriesQuery } from '@/features/environment-map/api/queries'
import { useModelCategoriesQuery } from '@/features/models/api/queries'
import { useSoundCategoriesQuery } from '@/features/sounds/api/queries'
import { useSpriteCategoriesQuery } from '@/features/sprite/api/queries'
import { getTextureSetCategoriesQueryOptions } from '@/features/texture-set/api/queries'
import { TextureSetKind } from '@/features/texture-set/types'
import { client } from '@/lib/apiBase'
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/renderWithProviders'

import { useCategoryOptionsQuery } from '../queries'

/**
 * Two consumers, one cache key, one shape.
 *
 * <p>
 * The metadata picker reads every family's category tree from that family's own
 * query key, so the sidebar's invalidations reach it for free. What it must not
 * do is store something else under that key - and it did: the Sound and Sprite
 * queries cache the server envelope `{ categories: [...] }`, and the picker
 * wrote a bare array under `['soundCategories']` / `['spriteCategories']`.
 * </p>
 *
 * <p>
 * Whichever mounted second overwrote the first one's shape, so the failure
 * depended entirely on the order the user navigated in: open Sounds then the
 * metadata panel and the sidebar's next read finds `.categories` of an array;
 * open them the other way round and the picker maps over an object. Both orders
 * are exercised here for every family, which is the only way a shared-key bug
 * shows up at all.
 * </p>
 */
describe('category query cache shapes are shared, not overwritten', () => {
  const mockGet = client.get as jest.Mock

  /** `useQuery` over a prebuilt options object - the texture-set call sites' shape. */
  function useQueryFromOptions(options: {
    queryKey: readonly unknown[]
    queryFn: () => Promise<unknown>
  }) {
    return useQuery(options)
  }

  const CATEGORIES = [
    { id: 3, name: 'Props', parentId: null, path: 'Props' },
    { id: 4, name: 'Furniture', parentId: 3, path: 'Props / Furniture' },
  ]

  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestQueryClient()
    mockGet.mockReset()
    // Every category endpoint answers with the same envelope the server sends.
    mockGet.mockImplementation(() =>
      Promise.resolve({ data: { categories: CATEGORIES } })
    )
  })

  function wrapper() {
    return { wrapper: createQueryWrapper(queryClient) }
  }

  /** The picker's view of one family. */
  function renderPicker(family: string, kind: TextureSetKind | null = null) {
    return renderHook(
      () => useCategoryOptionsQuery({ family, kind }),
      wrapper()
    )
  }

  /**
   * Each family paired with the established consumer that shares its key, and
   * how that consumer reads its own cached shape. `Material` and both texture-set
   * kinds are separate entries because they are separate cache keys.
   */
  const families = [
    {
      name: 'Model',
      family: 'Model',
      kind: null,
      renderEstablished: () =>
        renderHook(() => useModelCategoriesQuery(), wrapper()),
      readEstablished: (data: unknown) => data as typeof CATEGORIES,
    },
    {
      name: 'Sound',
      family: 'Sound',
      kind: null,
      renderEstablished: () =>
        renderHook(() => useSoundCategoriesQuery(), wrapper()),
      readEstablished: (data: unknown) =>
        (data as { categories: typeof CATEGORIES }).categories,
    },
    {
      name: 'Sprite',
      family: 'Sprite',
      kind: null,
      renderEstablished: () =>
        renderHook(() => useSpriteCategoriesQuery(), wrapper()),
      readEstablished: (data: unknown) =>
        (data as { categories: typeof CATEGORIES }).categories,
    },
    {
      name: 'EnvironmentMap',
      family: 'EnvironmentMap',
      kind: null,
      renderEstablished: () =>
        renderHook(() => useEnvironmentMapCategoriesQuery(), wrapper()),
      readEstablished: (data: unknown) => data as typeof CATEGORIES,
    },
    {
      name: 'Material (Universal texture-set tree)',
      family: 'Material',
      kind: TextureSetKind.Universal,
      renderEstablished: () =>
        renderHook(
          () =>
            useQueryFromOptions(
              getTextureSetCategoriesQueryOptions(TextureSetKind.Universal)
            ),
          wrapper()
        ),
      readEstablished: (data: unknown) => data as typeof CATEGORIES,
    },
    {
      name: 'TextureSet (Universal)',
      family: 'TextureSet',
      kind: TextureSetKind.Universal,
      renderEstablished: () =>
        renderHook(
          () =>
            useQueryFromOptions(
              getTextureSetCategoriesQueryOptions(TextureSetKind.Universal)
            ),
          wrapper()
        ),
      readEstablished: (data: unknown) => data as typeof CATEGORIES,
    },
    {
      name: 'TextureSet (ModelSpecific)',
      family: 'TextureSet',
      kind: TextureSetKind.ModelSpecific,
      renderEstablished: () =>
        renderHook(
          () =>
            useQueryFromOptions(
              getTextureSetCategoriesQueryOptions(TextureSetKind.ModelSpecific)
            ),
          wrapper()
        ),
      readEstablished: (data: unknown) => data as typeof CATEGORIES,
    },
  ]

  describe.each(families)(
    '$name',
    ({ family, kind, renderEstablished, readEstablished }) => {
      it('serves the picker an array when the existing UI cached first', async () => {
        const established = renderEstablished()
        await waitFor(() =>
          expect(established.result.current.data).toBeDefined()
        )

        const picker = renderPicker(family, kind)
        await waitFor(() => expect(picker.result.current.data).toBeDefined())

        expect(picker.result.current.data).toEqual(CATEGORIES)
        // And the existing UI still reads its own shape out of the same key.
        expect(readEstablished(established.result.current.data)).toEqual(
          CATEGORIES
        )
      })

      it('leaves the existing UI its own shape when the picker cached first', async () => {
        const picker = renderPicker(family, kind)
        await waitFor(() => expect(picker.result.current.data).toBeDefined())

        const established = renderEstablished()
        await waitFor(() =>
          expect(established.result.current.data).toBeDefined()
        )

        expect(readEstablished(established.result.current.data)).toEqual(
          CATEGORIES
        )
        expect(picker.result.current.data).toEqual(CATEGORIES)
      })

      it('puts both consumers on ONE cache entry, so one invalidation reaches both', async () => {
        // The reason the key is shared at all. Two entries would mean the
        // sidebar's invalidation refreshes the sidebar and leaves the picker
        // offering the tree as it was when the panel opened.
        const picker = renderPicker(family, kind)
        const established = renderEstablished()
        await waitFor(() => expect(picker.result.current.data).toBeDefined())
        await waitFor(() =>
          expect(established.result.current.data).toBeDefined()
        )

        const entries = queryClient.getQueryCache().getAll()
        expect(entries).toHaveLength(1)

        // And that one entry still answers both readers in their own shape.
        expect(picker.result.current.data).toEqual(CATEGORIES)
        expect(readEstablished(established.result.current.data)).toEqual(
          CATEGORIES
        )
      })
    }
  )

  it('never stores a bare array under a key that holds an envelope', async () => {
    // The property stated directly, rather than through a consumer: `select`
    // changes what this hook READS and must never change what the cache HOLDS.
    const picker = renderPicker('Sound')
    await waitFor(() => expect(picker.result.current.data).toBeDefined())

    const cached = queryClient.getQueryData(['soundCategories'])

    expect(Array.isArray(cached)).toBe(false)
    expect(cached).toEqual({ categories: CATEGORIES })
  })
})
