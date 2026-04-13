import { type HierarchicalCategory } from '@/shared/types/categories'

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

export type SoundCategoryDto = HierarchicalCategory

export interface GetAllSoundCategoriesResponse {
  categories: SoundCategoryDto[]
}

export interface GetAllSoundsResponsePaginated extends GetAllSoundsResponse {
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}
