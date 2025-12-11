// Common type definitions for the frontend

export interface Tab {
  id: string
  type:
    | 'modelList'
    | 'modelViewer'
    | 'textureSets'
    | 'textureSetViewer'
    | 'packs'
    | 'packViewer'
    | 'projects'
    | 'projectViewer'
    | 'sprites'
    | 'stageList'
    | 'stageEditor'
    | 'settings'
    | 'history'
    | 'recycledFiles'
  label?: string
  modelId?: string
  setId?: string
  packId?: string
  projectId?: string
  stageId?: string
}

export interface SplitterEvent {
  sizes: number[]
}

// TextureSet related types
export enum TextureType {
  Albedo = 1,
  Normal = 2,
  Height = 3,
  AO = 4,
  Roughness = 5,
  Metallic = 6,
  Diffuse = 7,
  Specular = 8,
  Emissive = 9,
  Bump = 10,
  Alpha = 11,
  Displacement = 12,
}

export interface TextureDto {
  id: number
  textureType: TextureType
  fileId: number
  fileName?: string
  createdAt: string
}

export interface ModelSummaryDto {
  id: number
  name: string
  versionNumber?: number
  modelVersionId: number
}

export interface PackSummaryDto {
  id: number
  name: string
}

export interface TextureSetDto {
  id: number
  name: string
  createdAt: string
  updatedAt: string
  textureCount: number
  isEmpty: boolean
  textures: TextureDto[]
  associatedModels: ModelSummaryDto[]
  packs?: PackSummaryDto[]
}

// API Request/Response types
export interface GetAllTextureSetsResponse {
  textureSets: TextureSetDto[]
}

export interface GetTextureSetByIdResponse {
  textureSet: TextureSetDto
}

export interface CreateTextureSetRequest {
  name: string
}

export interface CreateTextureSetResponse {
  id: number
  name: string
}

export interface UpdateTextureSetRequest {
  name: string
}

export interface UpdateTextureSetResponse {
  id: number
  name: string
}

export interface AddTextureToSetRequest {
  fileId: number
  textureType: TextureType
}

export interface AddTextureToSetResponse {
  textureId: number
  setId: number
}

// Error response type
export interface ApiError {
  error: string
  message: string
}

// Pack related types
export interface PackModelDto {
  id: number
  name: string
}

export interface PackTextureSetDto {
  id: number
  name: string
}

export interface PackSpriteDto {
  id: number
  name: string
}

export interface PackDto {
  id: number
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  modelCount: number
  textureSetCount: number
  spriteCount: number
  isEmpty: boolean
  models: PackModelDto[]
  textureSets: PackTextureSetDto[]
  sprites: PackSpriteDto[]
}

export interface GetAllPacksResponse {
  packs: PackDto[]
}

export interface CreatePackRequest {
  name: string
  description?: string
}

export interface CreatePackResponse {
  id: number
  name: string
  description?: string
}

export interface UpdatePackRequest {
  name: string
  description?: string
}

// Project related types
export interface ProjectModelDto {
  id: number
  name: string
}

export interface ProjectTextureSetDto {
  id: number
  name: string
}

export interface ProjectSpriteDto {
  id: number
  name: string
}

export interface ProjectDto {
  id: number
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  modelCount: number
  textureSetCount: number
  spriteCount: number
  isEmpty: boolean
  models: ProjectModelDto[]
  textureSets: ProjectTextureSetDto[]
  sprites: ProjectSpriteDto[]
}

export interface GetAllProjectsResponse {
  projects: ProjectDto[]
}

export interface CreateProjectRequest {
  name: string
  description?: string
}

export interface CreateProjectResponse {
  id: number
  name: string
  description?: string
}

export interface UpdateProjectRequest {
  name: string
  description?: string
}

// Model Version related types
export interface ModelVersionDto {
  id: number
  modelId: number
  versionNumber: number
  description?: string
  createdAt: string
  defaultTextureSetId?: number
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

// Sprite related types
export interface SpriteDto {
  id: number
  name: string
  fileId: number
  spriteType: number
  categoryId: number | null
  categoryName: string | null
  fileName: string
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
}

export interface GetAllSpritesResponse {
  sprites: SpriteDto[]
}
