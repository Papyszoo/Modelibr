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

/**
 * One animation clip extracted from a model file, as the API returns it:
 * `{name, durationSeconds, kinds}`.
 */
export interface ModelAnimationDto {
  name: string
  durationSeconds: number
  /** What the clip moves: any of skeletal / morph / material. */
  kinds: Array<'skeletal' | 'morph' | 'material'>
}

/**
 * One mesh's shape keys, as the API returns them: `{meshName, names}`.
 */
export interface ModelShapeKeysDto {
  meshName: string
  names: string[]
}

export interface ModelTechnicalMetadataDto {
  latestVersionId?: number | null
  latestVersionNumber?: number | null
  triangleCount?: number | null
  vertexCount?: number | null
  meshCount?: number | null
  materialCount?: number | null
  boundingBoxX?: number | null
  boundingBoxY?: number | null
  boundingBoxZ?: number | null
  animationCount?: number | null
  animationNames?: string[]
  /** Per-clip detail when the extraction recorded it; may be empty. */
  animations?: ModelAnimationDto[]
  /** Shape-key names per mesh when the extraction recorded them; may be empty. */
  shapeKeys?: ModelShapeKeysDto[]
  boneCount?: number | null
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
