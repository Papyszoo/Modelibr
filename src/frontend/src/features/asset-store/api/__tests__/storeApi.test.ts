/**
 * Contract tests for the store-origin API client. The store is a separate
 * service — these pin the exact endpoint paths, payload keys, and the
 * Authorization scheme from the store's INTEGRATION.md contract, so a silent
 * rename here (which the backend can't catch) goes red.
 */
import type { InternalAxiosRequestConfig } from 'axios'

import { ApiClientError } from '@/lib/apiBase'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import {
  attachStoreAuthHeader,
  getStoreLibrary,
  handleStoreResponseError,
  loginToStore,
  mintImportToken,
  storeClient,
} from '../storeApi'

const postMock = storeClient.post as jest.Mock
const getMock = storeClient.get as jest.Mock
const requestMock = storeClient.request as jest.Mock

function loggedInState() {
  useAssetStoreAuthStore.getState().setSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    username: 'artist',
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  useAssetStoreAuthStore.getState().clearSession()
})

describe('storeApi request construction', () => {
  // Regression: the store rejects a login whose body keys drift from
  // { email, password } — the 400 would look like "wrong password" to users.
  it('loginToStore posts credentials to /api/auth/login and unwraps the body', async () => {
    postMock.mockResolvedValue({
      data: { accessToken: 'a', refreshToken: 'r', username: 'u' },
    })

    const result = await loginToStore('me@example.com', 'hunter2')

    expect(postMock).toHaveBeenCalledWith('/api/auth/login', {
      email: 'me@example.com',
      password: 'hunter2',
    })
    expect(result.accessToken).toBe('a')
  })

  // Regression: the library endpoint clamps/pages via `page`/`pageSize`
  // query params — sending them in the path or renamed returns page 1
  // forever and the grid silently truncates at the default page size.
  it('getStoreLibrary passes page/pageSize as query params', async () => {
    getMock.mockResolvedValue({ data: { items: [], totalCount: 0 } })

    await getStoreLibrary(3, 48)

    expect(getMock).toHaveBeenCalledWith('/api/library', {
      params: { page: 3, pageSize: 48 },
    })
  })

  // Regression: the mint endpoint is per-asset — a path drift mints a token
  // for the wrong asset (or 404s) and every import fails.
  it('mintImportToken posts to the asset-scoped endpoint', async () => {
    postMock.mockResolvedValue({
      data: { token: 't', scheme: 'ImportToken', expiresAt: 'x' },
    })

    const result = await mintImportToken('asset-42')

    expect(postMock).toHaveBeenCalledWith('/api/library/asset-42/import-token')
    expect(result.token).toBe('t')
  })
})

describe('attachStoreAuthHeader', () => {
  const makeConfig = () =>
    ({ headers: {} }) as unknown as InternalAxiosRequestConfig

  // Regression: the store expects `Bearer <jwt>` — scheme drift (e.g. the
  // ImportToken scheme leaking in here) turns every library call into a 401.
  it('attaches the in-memory access token as a Bearer header', () => {
    loggedInState()
    const config = attachStoreAuthHeader(makeConfig())
    expect(config.headers.Authorization).toBe('Bearer access-1')
  })

  it('leaves requests untouched when logged out', () => {
    const config = attachStoreAuthHeader(makeConfig())
    expect(config.headers.Authorization).toBeUndefined()
  })
})

describe('handleStoreResponseError (401 refresh flow)', () => {
  const make401 = (url: string, retried = false) =>
    new ApiClientError('Unauthorized', {
      status: 401,
      isNetworkError: false,
      isTimeout: false,
      isOffline: false,
      requestConfig: {
        url,
        headers: {},
        _storeAuthRetried: retried || undefined,
      } as unknown as InternalAxiosRequestConfig,
    })

  // Regression: without the refresh-and-retry, every request after the
  // 10-minute access-token expiry fails until the user manually re-logs.
  it('refreshes tokens once and retries the original request', async () => {
    loggedInState()
    postMock.mockResolvedValue({
      data: { accessToken: 'access-2', refreshToken: 'refresh-2' },
    })
    requestMock.mockResolvedValue({ data: 'retried' })

    const result = await handleStoreResponseError(make401('/api/library'))

    expect(postMock).toHaveBeenCalledWith('/api/auth/refresh', {
      refreshToken: 'refresh-1',
    })
    const retriedConfig = requestMock.mock.calls[0][0]
    expect(retriedConfig.headers.Authorization).toBe('Bearer access-2')
    expect(retriedConfig._storeAuthRetried).toBe(true)
    expect(result).toEqual({ data: 'retried' })
    expect(useAssetStoreAuthStore.getState().accessToken).toBe('access-2')
  })

  // Regression: retrying a request that already retried loops forever
  // against a store that keeps 401ing.
  it('does not refresh again for an already-retried request', async () => {
    loggedInState()
    const error = make401('/api/library', true)
    await expect(handleStoreResponseError(error)).rejects.toBe(error)
    expect(postMock).not.toHaveBeenCalled()
  })

  // Regression: refreshing on a failed LOGIN would clobber the real error
  // and log the user out of nowhere.
  it('passes auth-endpoint 401s through untouched', async () => {
    loggedInState()
    const error = make401('/api/auth/login')
    await expect(handleStoreResponseError(error)).rejects.toBe(error)
    expect(postMock).not.toHaveBeenCalled()
  })

  it('clears the session when the refresh itself fails', async () => {
    loggedInState()
    postMock.mockRejectedValue(new Error('refresh token revoked'))

    await expect(
      handleStoreResponseError(make401('/api/library'))
    ).rejects.toBeInstanceOf(ApiClientError)

    const state = useAssetStoreAuthStore.getState()
    expect(state.status).toBe('loggedOut')
    expect(state.accessToken).toBeNull()
    expect(state.error).toMatch(/session expired/i)
  })
})
