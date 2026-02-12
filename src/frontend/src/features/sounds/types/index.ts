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

export interface GetAllSoundsResponsePaginated extends GetAllSoundsResponse {
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}
