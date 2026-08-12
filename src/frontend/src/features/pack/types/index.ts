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
  globalMaterialCount: number
  multiModelTextureCount: number
  spriteCount: number
  soundCount: number
  scriptCount: number
  environmentMapCount?: number
  isEmpty: boolean
  customThumbnailUrl?: string | null
  // Store-import provenance (set when the pack was imported from the
  // companion Asset Store) - the Asset Store page matches these to show
  // "Imported ✓" on library entries.
  storeImportUrl?: string | null
  storeImportAssetId?: string | null
  storeImportedAt?: string | null
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
