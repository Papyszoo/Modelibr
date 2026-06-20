import { client } from '@/lib/apiBase'

import { type GlobalSearchResponse } from '../types'

export async function globalSearch(
  term: string,
  perType = 8
): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams({ q: term, perType: String(perType) })
  const response = await client.get<GlobalSearchResponse>(
    `/search?${params.toString()}`
  )
  return response.data
}
