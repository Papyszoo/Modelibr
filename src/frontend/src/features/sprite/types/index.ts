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

export interface GetAllSpritesResponsePaginated extends GetAllSpritesResponse {
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}
