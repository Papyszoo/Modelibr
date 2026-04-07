export interface TextureMappingDto {
  materialName: string
  textureSetId: number
  variantName: string
}

export interface ModelVersionDto {
  id: number
  modelId: number
  versionNumber: number
  description?: string
  createdAt: string
  defaultTextureSetId?: number
  triangleCount?: number | null
  vertexCount?: number | null
  meshCount?: number | null
  materialCount?: number | null
  technicalDetailsUpdatedAt?: string | null
  thumbnailUrl?: string
  pngThumbnailUrl?: string
  files: VersionFileDto[]
  materialNames: string[]
  mainVariantName?: string
  variantNames: string[]
  textureMappings: TextureMappingDto[]
  textureSetIds: number[]
}

export interface VersionFileDto {
  id: number
  originalFileName: string
  mimeType: string
  fileType: string
  sizeBytes: number
  isRenderable: boolean
}

export interface GetModelVersionsResponse {
  versions: ModelVersionDto[]
}

export interface CreateModelVersionResponse {
  versionId: number
  versionNumber: number
  fileId: number
}
