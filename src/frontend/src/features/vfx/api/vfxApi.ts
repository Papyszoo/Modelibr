import { ApiClientError, baseURL, client } from '@/lib/apiBase'

import type { VfxDefinition, VfxDetail, VfxProblem, VfxSummary } from '../types'

export async function getVfxList(): Promise<VfxSummary[]> {
  const response = await client.get<VfxSummary[]>('/vfx')
  return response.data
}

export async function getVfx(id: number): Promise<VfxDetail> {
  const response = await client.get<VfxDetail>(`/vfx/${id}`)
  return response.data
}

export async function createVfx(body: {
  name: string
  description?: string | null
  definition?: VfxDefinition
}): Promise<VfxDetail> {
  const response = await client.post<VfxDetail>('/vfx', body)
  return response.data
}

export async function updateVfx(
  id: number,
  body: {
    name?: string
    description?: string | null
    definition?: VfxDefinition
  }
): Promise<VfxDetail> {
  const response = await client.put<VfxDetail>(`/vfx/${id}`, body)
  return response.data
}

export async function deleteVfx(id: number): Promise<void> {
  await client.delete(`/vfx/${id}`)
}

/** The Godot export is a zip download, so it is a link rather than a call. */
export function getVfxGodotExportUrl(id: number): string {
  return `${baseURL}/vfx/${id}/export/godot`
}

/**
 * The validation problems a rejected save carries, or an empty list when the
 * error was anything else. The server reports every problem at once, each with
 * the path of the field it is about.
 */
export function vfxProblems(error: unknown): VfxProblem[] {
  if (!(error instanceof ApiClientError) || error.status !== 400) return []
  const details = error.details as { problems?: unknown } | undefined
  return Array.isArray(details?.problems)
    ? (details.problems as VfxProblem[])
    : []
}
