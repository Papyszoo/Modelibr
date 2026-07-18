import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

import { ApiClientError, createApiClient } from '@/lib/apiBase'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { getConfiguredStoreUrl } from '../lib/storeConfig'
import type {
  MintImportTokenResponse,
  StoreAssetDetail,
  StoreAuthResponse,
  StoreLibraryPage,
} from '../types'

/**
 * Axios client for the STORE origin (credential-less CORS — auth is a bearer
 * token attached here, never cookies). Store credentials and tokens never
 * touch the local Modelibr backend.
 */
export const storeClient: AxiosInstance = createApiClient(
  getConfiguredStoreUrl() ?? ''
)

/** Attaches the in-memory access token to store requests. Exported for tests. */
export function attachStoreAuthHeader(
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
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
 * 401 handling: refresh the tokens once and retry the original request; a
 * failed refresh (or a 401 on the retry) logs the session out. Auth endpoints
 * themselves are exempt — a failed login must surface as-is. Exported for
 * tests.
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
    try {
      const refreshed = await refreshStoreTokensOnce(auth.refreshToken)
      useAssetStoreAuthStore.getState().setTokens({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
      })
      config._storeAuthRetried = true
      config.headers.Authorization = `Bearer ${refreshed.accessToken}`
      return await storeClient.request(config)
    } catch {
      useAssetStoreAuthStore
        .getState()
        .clearSession('Your store session expired. Please sign in again.')
    }
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

let refreshInFlight: Promise<StoreAuthResponse> | null = null

/**
 * Single-flight refresh: concurrent 401 retries (or the proactive session
 * loop racing the interceptor) share ONE refresh call. A store that rotates
 * refresh tokens on use must never see the same token twice — the loser of
 * that race would 401 and clear a session that just refreshed successfully.
 * Callers joining an in-flight refresh get its result regardless of the
 * token they passed (both callers necessarily hold the same, pre-rotation one).
 */
export function refreshStoreTokensOnce(
  refreshToken: string
): Promise<StoreAuthResponse> {
  if (!refreshInFlight) {
    refreshInFlight = refreshStoreTokens(refreshToken).finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
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
