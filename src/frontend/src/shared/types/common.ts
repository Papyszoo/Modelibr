export interface ApiError {
  error: string
  message: string
}

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
