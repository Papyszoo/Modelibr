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

export interface PackEnvironmentMapDto {
  id: number
  name: string
}

export interface PackDto {
  id: number
  name: string
  description?: string
  licenseType?: string
  url?: string
  createdAt: string
  updatedAt: string
  modelCount: number
  textureSetCount: number
  spriteCount: number
  soundCount: number
  environmentMapCount?: number
  isEmpty: boolean
  customThumbnailUrl?: string | null
  models: PackModelDto[]
  textureSets: PackTextureSetDto[]
  sprites: PackSpriteDto[]
  environmentMaps?: PackEnvironmentMapDto[]
}

export type PackDetailDto = PackDto

export interface GetAllPacksResponse {
  packs: PackDto[]
}

export interface CreatePackRequest {
  name: string
  description?: string
  licenseType?: string
  url?: string
}

export interface CreatePackResponse {
  id: number
  name: string
  description?: string
  licenseType?: string
  url?: string
}

export interface UpdatePackRequest {
  name: string
  description?: string
  licenseType?: string
  url?: string
}
