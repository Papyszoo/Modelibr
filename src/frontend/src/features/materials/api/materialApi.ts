import { type AxiosResponse } from 'axios'

import { client } from '@/lib/apiBase'

/** glTF's alphaMode, which is what the viewport and every exporter speak. */
export type AlphaMode = 'Opaque' | 'Mask' | 'Blend'

/**
 * The scalar half of a PBR material. Factors are linear (glTF's convention);
 * `baseColorHex` is the same colour in sRGB, for pickers and for anyone reading.
 */
export interface MaterialParametersDto {
  baseColorR: number
  baseColorG: number
  baseColorB: number
  baseColorA: number
  baseColorHex: string
  roughness: number
  metallic: number
  emissiveR: number
  emissiveG: number
  emissiveB: number
  normalScale: number
  occlusionStrength: number
  ior: number
  alphaMode: AlphaMode
  alphaCutoff: number
  doubleSided: boolean
}

export interface MaterialDto {
  id: number
  name: string
  description: string | null
  categoryId: number | null
  categoryName: string | null
  parameters: MaterialParametersDto
  previewGeometryType: string
  requiresUvs: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** Which table a library entry came from. Ids are unique per kind, not across both. */
export type MaterialLibraryEntryKind = 'Material' | 'GlobalMaterial'

export interface MaterialTilingDto {
  tilingScaleX: number
  tilingScaleY: number
  uvMappingMode: string
  uvScale: number
  channelCount: number
}

/**
 * One entry of the merged browse surface. `requiresUvs` is the only distinction
 * worth acting on: a user shopping for "oak" should not have to know which
 * mechanism supplies it.
 */
export interface MaterialLibraryEntryDto {
  kind: MaterialLibraryEntryKind
  id: number
  name: string
  description: string | null
  categoryId: number | null
  categoryName: string | null
  requiresUvs: boolean
  previewGeometryType: string
  hasThumbnail: boolean
  parameters: MaterialParametersDto | null
  tiling: MaterialTilingDto | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface MaterialLibraryResponse {
  entries: MaterialLibraryEntryDto[]
  totalCount: number
  page: number | null
  pageSize: number | null
  totalPages: number | null
}

export interface CreateMaterialRequest {
  name: string
  parameters?: Partial<
    Omit<MaterialParametersDto, 'baseColorHex'> & { baseColorHex: string }
  >
  description?: string | null
  categoryId?: number | null
  previewGeometryType?: string | null
  tags?: string[]
}

export async function getMaterialById(
  materialId: number
): Promise<MaterialDto> {
  const response: AxiosResponse<MaterialDto> = await client.get(
    `/materials/${materialId}`
  )
  return response.data
}

export interface GetAllMaterialsResponse {
  materials: MaterialDto[]
}

/**
 * Parameter materials only - the PBR page's source. Deliberately NOT the
 * merged `/materials/library`: a texture set and a parameter material are
 * browsed on separate pages, and only merged where the user is picking
 * something to put in a material slot.
 */
export async function getAllMaterials(
  options: { search?: string; categoryIds?: number[] } = {}
): Promise<GetAllMaterialsResponse> {
  const params = new URLSearchParams()
  if (options.search) params.set('searchName', options.search)
  for (const id of options.categoryIds ?? [])
    params.append('categoryIds', String(id))

  const query = params.toString()
  const response: AxiosResponse<GetAllMaterialsResponse> = await client.get(
    `/materials${query ? `?${query}` : ''}`
  )
  return response.data
}

export async function getMaterialLibrary(
  options: {
    search?: string
    requiresUvs?: boolean
    categoryIds?: number[]
    page?: number
    pageSize?: number
  } = {}
): Promise<MaterialLibraryResponse> {
  const params = new URLSearchParams()
  if (options.search) params.set('searchName', options.search)
  if (options.requiresUvs != null)
    params.set('requiresUvs', String(options.requiresUvs))
  for (const id of options.categoryIds ?? [])
    params.append('categoryIds', String(id))
  if (options.page != null) params.set('page', String(options.page))
  if (options.pageSize != null) params.set('pageSize', String(options.pageSize))

  const query = params.toString()
  const response: AxiosResponse<MaterialLibraryResponse> = await client.get(
    `/materials/library${query ? `?${query}` : ''}`
  )
  return response.data
}

export async function createMaterial(
  request: CreateMaterialRequest
): Promise<{ id: number; name: string }> {
  const response: AxiosResponse<{ id: number; name: string }> =
    await client.post('/materials', request)
  return response.data
}

export async function updateMaterial(
  materialId: number,
  request: Partial<CreateMaterialRequest> & { clearCategory?: boolean }
): Promise<MaterialDto> {
  const response: AxiosResponse<MaterialDto> = await client.put(
    `/materials/${materialId}`,
    request
  )
  return response.data
}

export async function deleteMaterial(materialId: number): Promise<void> {
  await client.delete(`/materials/${materialId}`)
}
