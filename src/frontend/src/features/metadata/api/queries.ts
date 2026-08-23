import { queryOptions, useQuery } from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import { getAssetMetadata, getAssetMetadataSchema } from './metadataApi'

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
