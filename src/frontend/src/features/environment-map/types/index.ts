import { type HierarchicalCategory } from '@/shared/types/categories'

export type EnvironmentMapCubeFace = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz'

export type EnvironmentMapCubeFaceUrls = Partial<
  Record<EnvironmentMapCubeFace, string | null>
>

export interface EnvironmentMapFileDto {
  fileId: number
  fileName: string
  fileSizeBytes: number
  previewUrl: string
  fileUrl: string
}

export interface EnvironmentMapCubeFacesDto {
  px: EnvironmentMapFileDto
  nx: EnvironmentMapFileDto
  py: EnvironmentMapFileDto
  ny: EnvironmentMapFileDto
  pz: EnvironmentMapFileDto
  nz: EnvironmentMapFileDto
}

export interface EnvironmentMapVariantDto {
  id: number
  sizeLabel: string
  previewFileId?: number | null
  fileId?: number | null
  fileName: string
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  previewUrl?: string | null
  fileUrl?: string | null
  sourceType?: string | null
  projectionType?: string | null
  cubeFaceUrls?: EnvironmentMapCubeFaceUrls | null
  panoramicFile?: EnvironmentMapFileDto | null
  cubeFaces?: EnvironmentMapCubeFacesDto | null
  pxUrl?: string | null
  nxUrl?: string | null
  pyUrl?: string | null
  nyUrl?: string | null
  pzUrl?: string | null
  nzUrl?: string | null
}

export interface EnvironmentMapContainerSummaryDto {
  id: number
  name: string
}

export interface EnvironmentMapDto {
  id: number
  name: string
  variantCount: number
  categoryId?: number | null
  categoryPath?: string | null
  previewSizeLabel?: string | null
  sizeLabels?: string[]
  previewVariantId?: number | null
  previewFileId?: number | null
  previewUrl?: string | null
  customThumbnailFileId?: number | null
  customThumbnailUrl?: string | null
  sourceType?: string | null
  sourceTypes?: string[]
  projectionType?: string | null
  projectionTypes?: string[]
  cubeFaceUrls?: EnvironmentMapCubeFaceUrls | null
  panoramicFile?: EnvironmentMapFileDto | null
  cubeFaces?: EnvironmentMapCubeFacesDto | null
  pxUrl?: string | null
  nxUrl?: string | null
  pyUrl?: string | null
  nyUrl?: string | null
  pzUrl?: string | null
  nzUrl?: string | null
  createdAt: string
  updatedAt: string
  tags?: string[]
  variants?: EnvironmentMapVariantDto[]
  packs?: EnvironmentMapContainerSummaryDto[]
  projects?: EnvironmentMapContainerSummaryDto[]
}

export interface GetAllEnvironmentMapsResponse {
  environmentMaps: EnvironmentMapDto[]
}

export type EnvironmentMapCategoryDto = HierarchicalCategory

export interface GetAllEnvironmentMapCategoriesResponse {
  categories: EnvironmentMapCategoryDto[]
}

export interface UpsertEnvironmentMapCategoryRequest {
  name: string
  description?: string
  parentId?: number | null
}

export interface GetAllEnvironmentMapsResponsePaginated
  extends GetAllEnvironmentMapsResponse {
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreateEnvironmentMapWithFileResponse {
  environmentMapId: number
  name: string
  variantId: number
  fileId: number
  previewVariantId?: number | null
  projectionType?: string | null
}

export interface AddEnvironmentMapVariantWithFileResponse {
  variantId: number
  fileId: number
  sizeLabel: string
  projectionType?: string | null
}

export interface UpdateEnvironmentMapMetadataResponse {
  environmentMapId: number
  tags: string[]
  categoryId?: number | null
}
