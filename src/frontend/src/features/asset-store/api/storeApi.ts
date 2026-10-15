import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

import { ApiClientError, createApiClient } from '@/lib/apiBase'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { isTerminalAuthFailure } from '../lib/authFailure'
import { STORE_URL } from '../lib/storeConfig'
import type {
  MintImportTokenResponse,
  StoreAssetDetail,
  StoreAuthResponse,
  StoreCatalogPage,
  StoreLibraryItem,
  StoreLibraryPage,
} from '../types'

/**
 * Axios client for the STORE origin (credential-less CORS - auth is a bearer
 * token attached here, never cookies). Store credentials and tokens never
 * touch the local Modelibr backend.
 *
 * The base URL is pinned again per request by the interceptor below, so a stale
 * base URL can never resolve '/api/library' against Modelibr's own origin and
 * mail the store bearer token to the local backend.
 */
export const storeClient: AxiosInstance = createApiClient(STORE_URL)

/**
 * Pins every store request to the store origin and attaches the access token.
 * Throwing here rejects the request before it is sent - the correct outcome when
 * there is nowhere legitimate to send it. Exported for tests.
 */
export function attachStoreAuthHeader(
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  // Re-pin rather than merely check: the seeded baseURL may be stale.
  config.baseURL = STORE_URL
  // An absolute config.url ignores baseURL entirely, so validate the resolved
  // target too - credentials only ever leave for the store origin.
  const target = new URL(config.url ?? '', STORE_URL)
  if (target.origin !== new URL(STORE_URL).origin) {
    throw new Error(
      `Refusing to send a store request to ${target.origin} - the store is ${new URL(STORE_URL).origin}.`
    )
  }

  const { accessToken } = useAssetStoreAuthStore.getState()
  if (accessToken && config.headers && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
}

storeClient.interceptors.request.use(attachStoreAuthHeader)

/** Retry marker so a request is re-attempted at most once after a refresh. */
type RetriableConfig = InternalAxiosRequestConfig & {
  _storeAuthRetried?: boolean
}

/**
 * 401 handling: refresh the tokens once and retry the original request. Only a
 * refresh REJECTED by the store logs the session out (see isTerminalAuthFailure)
 * and only while the session is still the one the refresh started for. Auth
 * endpoints themselves are exempt - a failed login must surface as-is. Exported
 * for tests.
 */
export async function handleStoreResponseError(
  error: unknown
): Promise<unknown> {
  const auth = useAssetStoreAuthStore.getState()
  const apiError = error as ApiClientError
  const config = apiError.requestConfig as RetriableConfig | undefined

  const isAuthEndpoint = config?.url?.includes('/api/auth/') ?? false
  if (
    apiError instanceof ApiClientError &&
    apiError.status === 401 &&
    auth.status === 'loggedIn' &&
    auth.refreshToken &&
    config &&
    !config._storeAuthRetried &&
    !isAuthEndpoint
  ) {
    const startedWith = auth.refreshToken

    let refreshed: StoreAuthResponse
    try {
      refreshed = await refreshStoreTokensOnce(startedWith)
    } catch (refreshError) {
      // Two guards before signing anyone out. The session must still be the one
      // this refresh was started for - otherwise a late failure for account A
      // would clear account B - and the failure must actually invalidate the
      // token: a busy or briefly broken store is not an expired session.
      const current = useAssetStoreAuthStore.getState()
      if (
        current.refreshToken === startedWith &&
        isTerminalAuthFailure(refreshError)
      ) {
        current.clearSession(
          'Your store session expired. Please sign in again.'
        )
      }
      throw error
    }

    useAssetStoreAuthStore.getState().setTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      previousRefreshToken: startedWith,
    })

    // setTokens drops a result whose session is gone (logged out, or logged in as
    // someone else meanwhile). Retrying anyway would replay the FIRST account's
    // request and cache its response under the second account's queries.
    if (
      useAssetStoreAuthStore.getState().refreshToken !== refreshed.refreshToken
    ) {
      throw error
    }

    config._storeAuthRetried = true
    config.headers.Authorization = `Bearer ${refreshed.accessToken}`
    return await storeClient.request(config)
  }

  throw error
}

storeClient.interceptors.response.use(
  response => response,
  handleStoreResponseError
)

export async function loginToStore(
  email: string,
  password: string
): Promise<StoreAuthResponse> {
  const response = await storeClient.post<StoreAuthResponse>(
    '/api/auth/login',
    { email, password }
  )
  return response.data
}

export async function refreshStoreTokens(
  refreshToken: string
): Promise<StoreAuthResponse> {
  const response = await storeClient.post<StoreAuthResponse>(
    '/api/auth/refresh',
    { refreshToken }
  )
  return response.data
}

let refreshInFlight: {
  token: string
  promise: Promise<StoreAuthResponse>
} | null = null

/**
 * Single-flight refresh: concurrent 401 retries (or the proactive session
 * loop racing the interceptor) share ONE refresh call. A store that rotates
 * refresh tokens on use must never see the same token twice - the loser of
 * that race would 401 and clear a session that just refreshed successfully.
 *
 * The flight is KEYED by refresh token, i.e. by session: a caller holding a
 * different token (the user logged out and signed in as someone else while the
 * first refresh was still open) starts its own call instead of being handed
 * account A's tokens. `setTokens` re-checks the same key before applying.
 */
export function refreshStoreTokensOnce(
  refreshToken: string
): Promise<StoreAuthResponse> {
  if (refreshInFlight?.token === refreshToken) {
    return refreshInFlight.promise
  }
  const promise = refreshStoreTokens(refreshToken).finally(() => {
    if (refreshInFlight?.token === refreshToken) {
      refreshInFlight = null
    }
  })
  refreshInFlight = { token: refreshToken, promise }
  return promise
}

export async function getStoreLibrary(
  page: number,
  pageSize: number
): Promise<StoreLibraryPage> {
  const response = await storeClient.get<StoreLibraryPage>('/api/library', {
    params: { page, pageSize },
  })
  return response.data
}

/**
 * One public-catalog entry, in the shape the grid/detail consume. The store
 * sends no `isFree` flag; the backend's catalog client derives it the same way
 * (price 0 = free), and a pack without a price counts as free.
 */
export function toLibraryItemFromCatalog(
  asset: StoreCatalogAsset
): StoreLibraryItem {
  return {
    assetId: asset.id,
    title: asset.title,
    author: asset.author ?? '',
    itemTypes: asset.itemTypes ?? [],
    license: asset.license ?? '',
    isPack: asset.isPack ?? false,
    fileCount: asset.itemCount ?? 0,
    totalSize: asset.fileSize ?? 0,
    previewThumbnailUrl: asset.thumbnailUrl ?? null,
    isFree: (asset.price ?? 0) === 0,
  }
}

/**
 * The store's PUBLIC catalog (GET /api/assets) - the anonymous browse read
 * behind the signed-out Asset Store tab. Normalized to the library page shape
 * so the grid, pager and "already imported" resolution are shared, not
 * forked.
 */
export async function getStoreCatalog(
  page: number,
  pageSize: number
): Promise<StoreLibraryPage> {
  const response = await storeClient.get<StoreCatalogPage>('/api/assets', {
    params: { page, pageSize },
  })
  const data = response.data
  return {
    items: (data.items ?? []).map(toLibraryItemFromCatalog),
    page: data.page || page,
    pageSize: data.pageSize || pageSize,
    totalCount: data.totalCount ?? 0,
    totalPages: data.totalPages ?? 0,
  }
}

/**
 * Fetches a store asset's detail (items + files + previews) so the user can pick
 * which pack items to import. Public store endpoint; the access token is attached
 * when present but not required.
 */
export async function getStoreAsset(
  assetId: string
): Promise<StoreAssetDetail> {
  const response = await storeClient.get<StoreAssetDetail>(
    `/api/assets/${assetId}`
  )
  return response.data
}

/**
 * Mints the short-lived, asset-scoped import token the LOCAL backend uses to
 * pull the pack. This is the only credential that ever reaches it.
 */
export async function mintImportToken(
  assetId: string
): Promise<MintImportTokenResponse> {
  const response = await storeClient.post<MintImportTokenResponse>(
    `/api/library/${assetId}/import-token`
  )
  return response.data
}
