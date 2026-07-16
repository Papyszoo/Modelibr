import { client } from '@/lib/apiBase'

import type { StartStoreImportResponse, StoreImportJobDto } from '../types'

// Local Modelibr backend — starts/polls the background import job. The
// import token is the only store credential in these calls (never the JWT).

export async function startStoreImport(request: {
  storeUrl: string
  assetId: string
  importToken: string
}): Promise<StartStoreImportResponse> {
  const response = await client.post<StartStoreImportResponse>(
    '/store-imports',
    request
  )
  return response.data
}

export async function getStoreImportJob(
  jobId: number
): Promise<StoreImportJobDto> {
  const response = await client.get<StoreImportJobDto>(
    `/store-imports/${jobId}`
  )
  return response.data
}
