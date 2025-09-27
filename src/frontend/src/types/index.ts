// Common type definitions for the frontend

export interface Tab {
  id: string
  type: 'modelList' | 'modelViewer' | 'texture' | 'animation' | 'texturePacks'
  label?: string
  modelId?: string
}

export interface SplitterEvent {
  sizes: number[]
}

// TexturePack related types
export enum TextureType {
  Albedo = 1,
  Normal = 2,
  Height = 3,
  AO = 4,
  Roughness = 5,
  Metallic = 6,
  Diffuse = 7,
  Specular = 8
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

export interface TexturePackDto {
  id: number
  name: string
  createdAt: string
  updatedAt: string
  textureCount: number
  isEmpty: boolean
  textures: TextureDto[]
  associatedModels: ModelSummaryDto[]
}

// API Request/Response types
export interface GetAllTexturePacksResponse {
  texturePacks: TexturePackDto[]
}

export interface GetTexturePackByIdResponse {
  texturePack: TexturePackDto
}

export interface CreateTexturePackRequest {
  name: string
}

export interface CreateTexturePackResponse {
  id: number
  name: string
}

export interface UpdateTexturePackRequest {
  name: string
}

export interface UpdateTexturePackResponse {
  id: number
  name: string
}

export interface AddTextureToPackRequest {
  fileId: number
  textureType: TextureType
}

export interface AddTextureToPackResponse {
  textureId: number
  packId: number
}

// Error response type
export interface ApiError {
  error: string
  message: string
}
