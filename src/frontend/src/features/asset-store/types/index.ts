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
  /**
   * Distinct item types contained in the entry ("Model", "Sound", …). Replaced
   * the store's removed `categoryName` - item types are the taxonomy now. The
   * grid doesn't surface it yet; it is kept so the type matches the wire.
   */
  itemTypes: string[]
  license: string
  isPack: boolean
  fileCount: number
  totalSize: number
  previewThumbnailUrl: string | null
  addedAt?: string
  /**
   * Public-catalog entries only (signed-out browsing): whether the pack can be
   * imported without a store account. Undefined for library entries, where the
   * store itself already gates the list.
   */
  isFree?: boolean
}

export interface StoreLibraryPage {
  items: StoreLibraryItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

// Public catalog (GET {storeUrl}/api/assets) - the anonymous browse read.
// A deliberately narrow subset of the store's asset DTO: only what the grid
// and the free/paid split need. Ids are the store's asset ids.

export interface StoreCatalogAsset {
  id: string
  title: string
  author?: string | null
  thumbnailUrl?: string | null
  itemTypes?: string[]
  isPack?: boolean
  itemCount?: number
  fileSize?: number
  license?: string | null
  price?: number
}

export interface StoreCatalogPage {
  items: StoreCatalogAsset[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

// Store asset detail (GET {storeUrl}/api/assets/{id}) - public, CORS-allowed for
// the Modelibr import page. Used to list a pack's items so the user can pick which
// ones to import. Item `id` matches the manifest item id the backend filters on.

export interface StoreAssetFile {
  id: string
  fileName: string
  relativePath: string
  fileSize: number
}

export interface StoreAssetItem {
  id: string
  itemType: string
  name: string
  isPreviewable: boolean
  /**
   * The item's backing file ids. Present on the store's library detail; the
   * PUBLIC catalog detail omits them, so signed-out pack browsing has no
   * per-item sizes (the code that sums them must tolerate that).
   */
  fileIds?: string[]
}

export interface StoreAssetPreview {
  id: string
  type: string
  url: string
  fileName: string
  packItemId: string | null
}

export interface StoreAssetDetail {
  id: string
  title: string
  author: string
  isPack: boolean
  files?: StoreAssetFile[]
  items?: StoreAssetItem[]
  previews?: StoreAssetPreview[]
}

export interface MintImportTokenResponse {
  token: string
  scheme: string
  expiresAt: string
}

// Local backend job DTOs (POST/GET /store-imports - prompt 05 backend).

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
