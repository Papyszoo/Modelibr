export enum TextureType {
  SplitChannel = 0,
  Albedo = 1,
  Normal = 2,
  Height = 3,
  AO = 4,
  Roughness = 5,
  Metallic = 6,
  Emissive = 9,
  Bump = 10,
  Alpha = 11,
  Displacement = 12,
}

export enum TextureChannel {
  R = 1,
  G = 2,
  B = 3,
  A = 4,
  RGB = 5,
}

export enum TextureSetKind {
  ModelSpecific = 0,
  Universal = 1,
}

export enum UvMappingMode {
  Standard = 0,
  Physical = 1,
}

export interface TextureDto {
  id: number
  textureType: TextureType
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
  kind: TextureSetKind
  tilingScaleX: number
  tilingScaleY: number
  uvMappingMode: UvMappingMode
  uvScale: number
  createdAt: string
  updatedAt: string
  textureCount: number
  isEmpty: boolean
  thumbnailPath?: string
  pngThumbnailPath?: string
  textures: TextureDto[]
  associatedModels: ModelSummaryDto[]
  packs?: PackSummaryDto[]
}

export interface GetAllTextureSetsResponse {
  textureSets: TextureSetDto[]
}

export interface GetTextureSetByIdResponse {
  textureSet: TextureSetDto
}

export interface CreateTextureSetRequest {
  name: string
  kind?: TextureSetKind
}

export interface CreateTextureSetResponse {
  id: number
  name: string
  kind: TextureSetKind
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
  sourceChannel?: TextureChannel
}

export interface AddTextureToSetResponse {
  textureId: number
  setId: number
  sourceChannel: TextureChannel
}

export interface GetAllTextureSetsResponsePaginated {
  textureSets: TextureSetDto[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface UpdateTilingScaleRequest {
  tilingScaleX: number
  tilingScaleY: number
  uvMappingMode?: UvMappingMode
  uvScale?: number
}

export interface UpdateTilingScaleResponse {
  id: number
  tilingScaleX: number
  tilingScaleY: number
  uvMappingMode: UvMappingMode
  uvScale: number
}
