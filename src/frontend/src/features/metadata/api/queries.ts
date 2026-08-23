import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

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
 * Accepts or takes back the automation's guesses.
 *
 * Invalidates the model list and the category counts as well as the queue itself:
 * rejecting removes categories and tags from real assets, and a sidebar still
 * counting them would be describing a library that no longer exists.
 */
export function useReviewImportSuggestionsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      accept,
      modelIds,
    }: {
      accept: boolean
      modelIds?: number[]
    }) => reviewImportSuggestions(accept, modelIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['metadata', 'import-suggestions'],
      })
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['model-tags'] })
    },
  })
}
