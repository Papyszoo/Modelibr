import {
  type QueryFunction,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { getEnvironmentMapCategoriesQueryOptions } from '@/features/environment-map/api/queries'
import { getModelCategoriesQueryOptions } from '@/features/models/api/queries'
import { getSoundCategoriesQueryOptions } from '@/features/sounds/api/queries'
import { getSpriteCategoriesQueryOptions } from '@/features/sprite/api/queries'
import { getTextureSetCategoriesQueryOptions } from '@/features/texture-set/api/queries'
import { TextureSetKind } from '@/features/texture-set/types'
import { type QueryConfig } from '@/lib/react-query'
import type { HierarchicalCategory } from '@/shared/types/categories'

import {
  getAssetMetadata,
  getAssetMetadataSchema,
  getImportSuggestions,
  reviewImportSuggestions,
} from './metadataApi'

/**
 * The schema is one declaration for the whole app and changes only when the
 * server does, so it is cached long and keyed without an asset.
 */
export function getAssetMetadataSchemaQueryOptions(assetType?: string) {
  return queryOptions({
    queryKey: ['metadata', 'schema', assetType ?? 'all'] as const,
    queryFn: () => getAssetMetadataSchema(assetType),
    staleTime: 10 * 60 * 1000,
  })
}

export function useAssetMetadataSchemaQuery({
  assetType,
  queryConfig = {},
}: {
  assetType?: string
  queryConfig?: QueryConfig<typeof getAssetMetadataSchemaQueryOptions>
} = {}) {
  return useQuery({
    ...getAssetMetadataSchemaQueryOptions(assetType),
    ...queryConfig,
  })
}

export function getAssetMetadataQueryOptions(
  assetType: string,
  assetId: number
) {
  return queryOptions({
    queryKey: ['metadata', 'values', assetType, assetId] as const,
    queryFn: () => getAssetMetadata(assetType, assetId),
  })
}

export function useAssetMetadataQuery({
  assetType,
  assetId,
  queryConfig = {},
}: {
  assetType: string
  assetId: number
  queryConfig?: QueryConfig<typeof getAssetMetadataQueryOptions>
}) {
  return useQuery({
    ...getAssetMetadataQueryOptions(assetType, assetId),
    ...queryConfig,
  })
}

/**
 * The import review queue. Kept short-lived rather than cached: an import running
 * in the background adds to it continuously, and a banner showing a stale count is
 * worse than one that flickers.
 */
export function getImportSuggestionsQueryOptions(page = 1, pageSize = 50) {
  return queryOptions({
    queryKey: ['metadata', 'import-suggestions', page, pageSize] as const,
    queryFn: () => getImportSuggestions(page, pageSize),
    staleTime: 30 * 1000,
  })
}

export function useImportSuggestionsQuery({
  page = 1,
  pageSize = 50,
  queryConfig = {},
}: {
  page?: number
  pageSize?: number
  queryConfig?: QueryConfig<typeof getImportSuggestionsQueryOptions>
} = {}) {
  return useQuery({
    ...getImportSuggestionsQueryOptions(page, pageSize),
    ...queryConfig,
  })
}

/**
 * How many follow-up calls a whole-queue action will make before giving up. At
 * 500 suggestions a call this covers 25,000 - more than an import produces - and
 * anything past it leaves `remaining` non-zero for the banner to keep showing.
 */
const MAX_REVIEW_PASSES = 50

/**
 * Accepts or takes back the automation's guesses.
 *
 * Invalidates the model list and the category counts as well as the queue itself:
 * rejecting removes categories and tags from real assets, and a sidebar still
 * counting them would be describing a library that no longer exists.
 */
export function useReviewImportSuggestionsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      accept,
      modelIds,
    }: {
      accept: boolean
      modelIds?: number[]
    }) => {
      // A whole-queue action is bounded server-side (500 per call), so one call
      // is not the action the button promises. Repeat while the server says work
      // is left, accumulating the counts so the caller sees what the WHOLE
      // action did rather than what its last page did.
      let result = await reviewImportSuggestions(accept, modelIds)
      if (modelIds) {
        return result
      }

      const total = { ...result }
      // Bounded rather than `while (remaining > 0)`: a server that kept
      // reporting work left would otherwise spin here forever.
      for (
        let pass = 0;
        pass < MAX_REVIEW_PASSES && result.remaining > 0;
        pass++
      ) {
        result = await reviewImportSuggestions(accept)
        total.reviewed += result.reviewed
        total.categoriesCleared += result.categoriesCleared
        total.tagsRemoved += result.tagsRemoved
        total.remaining = result.remaining
      }

      return total
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['metadata', 'import-suggestions'],
      })
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['model-tags'] })
    },
  })
}

/**
 * The category tree behind a `categoryRef` field.
 *
 * <p>
 * Deliberately built on each family's EXISTING query options - same fetcher,
 * same key, same cached shape - rather than on a fetcher of its own. A separate
 * key would be a second copy of the same list that nothing invalidates:
 * creating, renaming, moving or deleting a category invalidates the family's
 * key, and a picker keyed elsewhere would go on offering the tree as it was when
 * the panel opened.
 * </p>
 *
 * <p>
 * Sharing a key means sharing what is stored under it, and that is the whole of
 * why these are the real options objects and not a re-declaration of them. The
 * Sound and Sprite queries cache <code>{ categories: [...] }</code>; the picker
 * used to write a bare array under those same keys, so whichever mounted second
 * overwrote the other's shape - the sidebar reading `.categories` of an array,
 * or the picker mapping over an object, depending only on the order the user
 * happened to navigate in. The projection to an array is a `select`, which
 * transforms what this consumer READS and never what the cache HOLDS.
 * </p>
 *
 * <p>
 * `kind` is required for the texture-set tree and meaningless everywhere else.
 * It comes from the asset, not the schema: a Material always takes Universal
 * categories, and a TextureSet takes its own kind's, which differs between two
 * sets in the same family. The endpoint binds a missing kind to ModelSpecific
 * rather than rejecting it, so omitting it does not fail - it quietly returns
 * the wrong half of the tree.
 * </p>
 */
export function getCategoryOptionsQueryOptions(
  family: string,
  kind: TextureSetKind | null
): CategoryOptionsQuery {
  switch (family) {
    case 'Model':
      return borrow(getModelCategoriesQueryOptions(), categories => categories)

    case 'Sound':
      // Cached as { categories: [...] } by the sounds sidebar. Read as an array
      // here, stored as it always was.
      return borrow(getSoundCategoriesQueryOptions(), data => data.categories)

    case 'Sprite':
      return borrow(getSpriteCategoriesQueryOptions(), data => data.categories)

    case 'EnvironmentMap':
      return borrow(
        getEnvironmentMapCategoriesQueryOptions(),
        categories => categories
      )

    case 'TextureSet':
    case 'Material':
      // Universal is the fallback rather than the enum's zero value: a Material
      // only ever uses Universal, and a TextureSet whose kind has not loaded yet
      // is better shown the shared vocabulary than the model-specific one.
      return borrow(
        getTextureSetCategoriesQueryOptions(kind ?? TextureSetKind.Universal),
        categories => categories
      )

    default:
      return {
        queryKey: ['metadata', 'categories', 'unsupported', family],
        queryFn: async () => [],
        select: () => [],
      }
  }
}

/**
 * Wraps a family's own query options so this consumer can read a plain array out
 * of whatever that family caches.
 *
 * <p>
 * The key and the fetcher are passed through untouched - borrowed, not
 * reimplemented - and the shape difference is absorbed by `select`, which runs
 * on the way out of the cache and leaves the cached value alone. The one cast is
 * here, where the five differently-typed option objects are erased into the
 * single type `useQuery` can be called with; every call site above stays fully
 * checked against its own family's response.
 * </p>
 */
function borrow<TData>(
  options: {
    // Loose on the key and precise on the data: `queryOptions()` brands its
    // queryKey with the type it caches, and inferring from that brand drags the
    // whole tagged tuple in. The key is only ever passed through.
    queryKey: readonly unknown[]
    // Optional because `queryOptions()` types it so, never because a family may
    // omit it - see the guard below.
    queryFn?: QueryFunction<TData, never>
  },
  select: (data: TData) => HierarchicalCategory[]
): CategoryOptionsQuery {
  if (!options.queryFn) {
    // Loudly, rather than as a picker that says "Loading…" forever: a family
    // whose options carry no fetcher is a wiring mistake, and React Query's own
    // answer to a missing queryFn is to sit there.
    throw new Error('A category family was wired without a query function.')
  }

  const queryFn = options.queryFn as QueryFunction<unknown, readonly unknown[]>

  return {
    queryKey: options.queryKey,
    queryFn,
    select: data => select(data as TData),
  }
}

/**
 * One shape for all five, so the hook below has a single type to assign back.
 * `queryOptions()` would pin each branch's key as a literal tuple, and a union
 * of five of those cannot be handed to one `useQuery` call.
 *
 * <p>
 * `queryFn` returns `unknown` because each family caches its own shape and this
 * type must not flatten them into one - flattening them is exactly how a bare
 * array came to be written under a key holding an object. `select` is where the
 * difference is resolved, on read.
 * </p>
 */
interface CategoryOptionsQuery {
  queryKey: readonly unknown[]
  queryFn: QueryFunction<unknown, readonly unknown[]>
  select: (data: unknown) => HierarchicalCategory[]
}

/** Families whose `categoryRef` this picker can actually fill. */
const CATEGORY_FAMILIES = new Set([
  'Model',
  'Sound',
  'Sprite',
  'EnvironmentMap',
  'TextureSet',
  'Material',
])

export function useCategoryOptionsQuery({
  family,
  kind = null,
  enabled = true,
}: {
  family: string | null | undefined
  /** The asset's category kind, for the partitioned texture-set tree. */
  kind?: TextureSetKind | null
  enabled?: boolean
}) {
  // Narrower than the usual `queryConfig` seam on purpose: the picker only ever
  // needs to switch itself off, and a config typed over five different query
  // keys cannot be assigned back to any one of them.
  const { queryKey, queryFn, select } = getCategoryOptionsQueryOptions(
    family ?? '',
    kind
  )

  return useQuery({
    queryKey,
    queryFn,
    select,
    enabled: enabled && Boolean(family) && CATEGORY_FAMILIES.has(family ?? ''),
  })
}
