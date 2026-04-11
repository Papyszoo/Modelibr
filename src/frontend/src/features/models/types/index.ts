import { type HierarchicalCategory } from '@/shared/types/categories'

export type ModelCategoryDto = HierarchicalCategory

export interface ModelConceptImageDto {
  fileId: number
  fileName: string
  previewUrl: string
  fileUrl: string
  mimeType?: string
  sortOrder: number
}

export interface ModelTechnicalMetadataDto {
  latestVersionId?: number | null
  latestVersionNumber?: number | null
  triangleCount?: number | null
  vertexCount?: number | null
  meshCount?: number | null
  materialCount?: number | null
  updatedAt?: string | null
}

export interface GetAllModelCategoriesResponse {
  categories: ModelCategoryDto[]
}

export interface ModelTagDto {
  name: string
}

export interface GetAllModelTagsResponse {
  tags: ModelTagDto[]
}

export interface UpsertModelCategoryRequest {
  name: string
  description?: string
  parentId?: number | null
}
