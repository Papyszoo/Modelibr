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
