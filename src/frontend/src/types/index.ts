// Common type definitions for the frontend

export interface Tab {
  id: string
  type:
    | 'modelList'
    | 'modelViewer'
    | 'texture'
    | 'animation'
    | 'textureSets'
    | 'textureSetViewer'
    | 'packViewer'
    | 'settings'
  label?: string
  modelId?: string
  setId?: string
  packId?: string
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

export interface PackDto {
  id: number
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  modelCount: number
  textureSetCount: number
  isEmpty: boolean
  models: PackModelDto[]
  textureSets: PackTextureSetDto[]
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
