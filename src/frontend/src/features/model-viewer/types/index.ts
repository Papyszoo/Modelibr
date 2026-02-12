export interface ModelVersionDto {
  id: number
  modelId: number
  versionNumber: number
  description?: string
  createdAt: string
  defaultTextureSetId?: number
  thumbnailUrl?: string
  pngThumbnailUrl?: string
  files: VersionFileDto[]
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
