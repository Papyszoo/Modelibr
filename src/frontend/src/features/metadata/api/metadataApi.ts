import { client } from '@/lib/apiBase'

import type {
  AssetMetadataPatch,
  AssetMetadataResponse,
  AssetMetadataSchemaResponse,
  ImportSuggestionsResponse,
  ReviewImportSuggestionsResult,
} from '../types'

/**
 * Routed under `/metadata` rather than under the asset: `/assets/{type}/{id}/metadata`
 * already serves the derived extraction payload, and two different things called
 * "metadata" on one path would be a permanent source of confusion.
 */
export async function getAssetMetadataSchema(
  assetType?: string
): Promise<AssetMetadataSchemaResponse> {
  const response = await client.get<AssetMetadataSchemaResponse>(
    '/metadata/schema',
    { params: assetType ? { assetType } : undefined }
  )
  return response.data
}

export async function getAssetMetadata(
  assetType: string,
  assetId: number
): Promise<AssetMetadataResponse> {
  const response = await client.get<AssetMetadataResponse>(
    `/metadata/${assetType}/${assetId}`
  )
  return response.data
}

/**
 * PATCH, because the body is a patch: an absent key leaves the field alone, an
 * explicit null clears it. The body is the field map itself - there is no
 * wrapper object.
 */
export async function setAssetMetadata(
  assetType: string,
  assetId: number,
  fields: AssetMetadataPatch
): Promise<AssetMetadataResponse> {
  const response = await client.patch<AssetMetadataResponse>(
    `/metadata/${assetType}/${assetId}`,
    fields
  )
  return response.data
}

/**
 * The review queue: what the import automation categorized and tagged on its own
 * and nobody has settled yet.
 */
export async function getImportSuggestions(
  page = 1,
  pageSize = 50
): Promise<ImportSuggestionsResponse> {
  const response = await client.get<ImportSuggestionsResponse>(
    '/metadata/import-suggestions',
    { params: { page, pageSize } }
  )
  return response.data
}

/**
 * Settles the automation's guesses. `modelIds` omitted means everything waiting,
 * which the server bounds per call - repeat while `remaining` is above zero.
 */
export async function reviewImportSuggestions(
  accept: boolean,
  modelIds?: number[]
): Promise<ReviewImportSuggestionsResult> {
  const response = await client.post<ReviewImportSuggestionsResult>(
    '/metadata/import-suggestions/review',
    { accept, modelIds }
  )
  return response.data
}
