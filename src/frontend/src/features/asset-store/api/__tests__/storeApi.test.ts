/**
 * Contract tests for the store-origin API client. The store is a separate
 * service - these pin the exact endpoint paths, payload keys, and the
 * Authorization scheme from the store's INTEGRATION.md contract, so a silent
 * rename here (which the backend can't catch) goes red.
 */
import type { InternalAxiosRequestConfig } from 'axios'

import { ApiClientError } from '@/lib/apiBase'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import * as storeConfig from '../../lib/storeConfig'
import {
  attachStoreAuthHeader,
  getStoreLibrary,
  handleStoreResponseError,
  loginToStore,
  mintImportToken,
  refreshStoreTokensOnce,
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
  // { email, password } - the 400 would look like "wrong password" to users.
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
  // query params - sending them in the path or renamed returns page 1
  // forever and the grid silently truncates at the default page size.
  it('getStoreLibrary passes page/pageSize as query params', async () => {
    getMock.mockResolvedValue({ data: { items: [], totalCount: 0 } })

    await getStoreLibrary(3, 48)

    expect(getMock).toHaveBeenCalledWith('/api/library', {
      params: { page: 3, pageSize: 48 },
    })
  })

  // Regression: the mint endpoint is per-asset - a path drift mints a token
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

  // Regression: the store expects `Bearer <jwt>` - scheme drift (e.g. the
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

  it('clears the session when the store REJECTS the refresh token', async () => {
    loggedInState()
    postMock.mockRejectedValue(
      new ApiClientError('invalid refresh token', {
        status: 401,
        isNetworkError: false,
        isTimeout: false,
        isOffline: false,
      })
    )

    await expect(
      handleStoreResponseError(make401('/api/library'))
    ).rejects.toBeInstanceOf(ApiClientError)

    const state = useAssetStoreAuthStore.getState()
    expect(state.status).toBe('loggedOut')
    expect(state.accessToken).toBeNull()
    expect(state.error).toMatch(/session expired/i)
  })

  // Regression: this used to clear the session for ANY refresh failure, so a
  // rate-limited (429) or restarting (5xx) store signed the user out of a
  // session whose refresh token was still perfectly good.
  it('keeps the session when the refresh fails for a transient reason', async () => {
    loggedInState()
    postMock.mockRejectedValue(
      new ApiClientError('Too many requests', {
        status: 429,
        isNetworkError: false,
        isTimeout: false,
        isOffline: false,
      })
    )

    await expect(
      handleStoreResponseError(make401('/api/library'))
    ).rejects.toBeInstanceOf(ApiClientError)

    const state = useAssetStoreAuthStore.getState()
    expect(state.status).toBe('loggedIn')
    expect(state.refreshToken).toBe('refresh-1')
    expect(requestMock).not.toHaveBeenCalled()
  })

  // Regression: a refresh that resolved AFTER the user signed in as someone else
  // was dropped by setTokens (good) but the request was retried and cached
  // anyway - serving account A's response to account B.
  it('does not retry the request when the session changed mid-refresh', async () => {
    loggedInState()
    postMock.mockImplementation(async () => {
      // Someone signs in as another account while the refresh is open.
      useAssetStoreAuthStore.getState().setSession({
        accessToken: 'access-B',
        refreshToken: 'refresh-B',
        username: 'other-artist',
      })
      return { data: { accessToken: 'access-2', refreshToken: 'refresh-2' } }
    })

    const error = make401('/api/library')
    await expect(handleStoreResponseError(error)).rejects.toBe(error)

    expect(requestMock).not.toHaveBeenCalled()
    const state = useAssetStoreAuthStore.getState()
    expect(state.accessToken).toBe('access-B')
    expect(state.refreshToken).toBe('refresh-B')
  })

  // Regression: two requests 401ing at the same moment each ran their own
  // refresh - against a store that rotates refresh tokens on use, the second
  // refresh (with the now-consumed token) 401ed and logged the user out
  // right after a successful refresh.
  it('shares one refresh between concurrent 401s', async () => {
    loggedInState()
    postMock.mockResolvedValue({
      data: { accessToken: 'access-2', refreshToken: 'refresh-2' },
    })
    requestMock.mockResolvedValue({ data: 'ok' })

    await Promise.all([
      handleStoreResponseError(make401('/api/library')),
      handleStoreResponseError(make401('/api/library?page=2')),
    ])

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(useAssetStoreAuthStore.getState().accessToken).toBe('access-2')
  })
})

describe('refreshStoreTokensOnce', () => {
  it('joins an in-flight refresh and starts a new one after it settles', async () => {
    let resolvePost: (value: unknown) => void = () => {}
    postMock.mockReturnValueOnce(new Promise(r => (resolvePost = r)))

    const first = refreshStoreTokensOnce('refresh-1')
    const second = refreshStoreTokensOnce('refresh-1')
    expect(postMock).toHaveBeenCalledTimes(1)

    resolvePost({ data: { accessToken: 'a2', refreshToken: 'r2' } })
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)

    postMock.mockResolvedValue({
      data: { accessToken: 'a3', refreshToken: 'r3' },
    })
    await refreshStoreTokensOnce('r2')
    expect(postMock).toHaveBeenCalledTimes(2)
  })

  // Regression: the single flight was a bare module-level promise, not keyed by
  // session. Account A's refresh, still open while the user logged out and signed
  // in as B, resolved into B's session and replaced B's tokens with A's.
  it('does not share a flight across sessions, and drops a late result for a session that is gone', async () => {
    useAssetStoreAuthStore.getState().setSession({
      accessToken: 'a-access',
      refreshToken: 'a-refresh',
      username: 'account-a',
    })

    let resolveA: (value: unknown) => void = () => {}
    postMock.mockReturnValueOnce(new Promise(r => (resolveA = r)))
    const aFlight = refreshStoreTokensOnce('a-refresh')

    // The user logs out and signs in as B while A's refresh is still open.
    useAssetStoreAuthStore.getState().clearSession()
    useAssetStoreAuthStore.getState().setSession({
      accessToken: 'b-access',
      refreshToken: 'b-refresh',
      username: 'account-b',
    })

    // B's own refresh is a separate call - it must not be handed A's promise.
    postMock.mockResolvedValueOnce({
      data: { accessToken: 'b-access-2', refreshToken: 'b-refresh-2' },
    })
    const bResult = await refreshStoreTokensOnce('b-refresh')
    expect(postMock).toHaveBeenCalledTimes(2)
    expect(bResult.accessToken).toBe('b-access-2')

    // A's late response is discarded rather than applied over B's session.
    resolveA({
      data: { accessToken: 'a-access-2', refreshToken: 'a-refresh-2' },
    })
    const aResult = await aFlight
    useAssetStoreAuthStore.getState().setTokens({
      accessToken: aResult.accessToken,
      refreshToken: aResult.refreshToken,
      previousRefreshToken: 'a-refresh',
    })

    const state = useAssetStoreAuthStore.getState()
    expect(state.username).toBe('account-b')
    expect(state.accessToken).toBe('b-access')
  })
})

describe('store-origin binding', () => {
  // Regression: the client was built with `createApiClient(storeUrl ?? '')`. With
  // VITE_STORE_URL unset that is an EMPTY base URL, so '/api/library' resolved
  // against Modelibr's own origin and the store bearer token was sent to the
  // local backend. Nothing credentialed may leave without a configured store.
  it('refuses to send a store request when the store URL is not configured', () => {
    loggedInState()
    jest.spyOn(storeConfig, 'getConfiguredStoreUrl').mockReturnValue(null)

    expect(() =>
      attachStoreAuthHeader({
        url: '/api/library',
        headers: {},
      } as unknown as InternalAxiosRequestConfig)
    ).toThrow(/not configured/i)
  })

  it('refuses to send a store request aimed at a different origin', () => {
    loggedInState()
    jest
      .spyOn(storeConfig, 'getConfiguredStoreUrl')
      .mockReturnValue('https://store.test')

    expect(() =>
      attachStoreAuthHeader({
        url: 'https://evil.example/api/library',
        headers: {},
      } as unknown as InternalAxiosRequestConfig)
    ).toThrow(/Refusing to send a store request/i)
  })
})
