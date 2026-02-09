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
    | 'sounds'
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
  SplitChannel = 0,
  Albedo = 1,
  Normal = 2,
  Height = 3,
  AO = 4,
  Roughness = 5,
  Metallic = 6,
  // Diffuse = 7 (REMOVED - use Albedo instead)
  // Specular = 8 (REMOVED - not PBR standard)
  Emissive = 9,
  Bump = 10,
  Alpha = 11,
  Displacement = 12,
}

/**
 * Represents a source channel from a texture file.
 * Used for channel mapping where individual channels can be mapped to texture types.
 */
export enum TextureChannel {
  /** Red channel (for grayscale textures like AO, Roughness, Metallic) */
  R = 1,
  /** Green channel */
  G = 2,
  /** Blue channel */
  B = 3,
  /** Alpha channel */
  A = 4,
  /** RGB group (for color textures like Albedo, Normal, Emissive) */
  RGB = 5,
}

export interface TextureDto {
  id: number
  textureType: TextureType
  /** Source channel from the file (R, G, B, A for grayscale, RGB for color) */
  sourceChannel: TextureChannel
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
  /** Optional source channel for channel-packed textures */
  sourceChannel?: TextureChannel
}

export interface AddTextureToSetResponse {
  textureId: number
  setId: number
  sourceChannel: TextureChannel
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
  soundCount: number
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
  soundCount: number
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

// Sound related types
export interface SoundDto {
  id: number
  name: string
  fileId: number
  categoryId: number | null
  categoryName: string | null
  duration: number
  peaks: string | null
  fileName: string
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
  waveformUrl: string | null
}

export interface GetAllSoundsResponse {
  sounds: SoundDto[]
}

export interface SoundCategoryDto {
  id: number
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface GetAllSoundCategoriesResponse {
  categories: SoundCategoryDto[]
}

// Pagination types
export interface PaginatedResponse<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PaginationState {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasMore: boolean
}

export interface GetAllSoundsResponsePaginated extends GetAllSoundsResponse {
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface GetAllSpritesResponsePaginated extends GetAllSpritesResponse {
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface GetAllTextureSetsResponsePaginated {
  textureSets: TextureSetDto[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}
