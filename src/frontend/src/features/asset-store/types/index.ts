// Wire types for the companion Asset Store's Modelibr-integration endpoints
// (contract: store repo docs/INTEGRATION.md). All calls are browser → store;
// the local backend only ever sees the short-lived import token.

export interface StoreAuthResponse {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: string
  username: string
  role: string
}

export interface StoreLibraryItem {
  assetId: string
  title: string
  author: string
  categoryName: string
  license: string
  isPack: boolean
  fileCount: number
  totalSize: number
  previewThumbnailUrl: string | null
  addedAt: string
}

export interface StoreLibraryPage {
  items: StoreLibraryItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface MintImportTokenResponse {
  token: string
  scheme: string
  expiresAt: string
}

// Local backend job DTOs (POST/GET /store-imports — prompt 05 backend).

export interface StartStoreImportResponse {
  jobId: number
}

export interface StoreImportJobDto {
  id: number
  status: string
  packId: number | null
  storeAssetId: string
  manifestSchemaVersion: number
  itemsTotal: number
  itemsCreated: number
  itemsSkipped: number
  itemsFailed: number
  resultJson: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

/** SignalR "ImportProgress" event payload (StoreImportHub). */
export interface StoreImportProgressEvent {
  jobId: number
  status: string
  packId: number | null
  itemsTotal: number
  itemsProcessed: number
  itemsCreated: number
  itemsSkipped: number
  itemsFailed: number
  currentItem: string | null
  message: string | null
}
