export interface EnvironmentMapVariantDto {
  id: number
  sizeLabel: string
  fileId: number
  fileName: string
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  previewUrl: string
  fileUrl: string
}

export interface EnvironmentMapContainerSummaryDto {
  id: number
  name: string
}

export interface EnvironmentMapDto {
  id: number
  name: string
  variantCount: number
  previewVariantId?: number | null
  previewFileId?: number | null
  previewUrl?: string | null
  createdAt: string
  updatedAt: string
  variants?: EnvironmentMapVariantDto[]
  packs?: EnvironmentMapContainerSummaryDto[]
  projects?: EnvironmentMapContainerSummaryDto[]
}

export interface GetAllEnvironmentMapsResponse {
  environmentMaps: EnvironmentMapDto[]
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
}

export interface AddEnvironmentMapVariantWithFileResponse {
  variantId: number
  fileId: number
  sizeLabel: string
}
