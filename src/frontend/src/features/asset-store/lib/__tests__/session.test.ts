/**
 * Session lifecycle tests: the proactive refresh loop is what keeps a store
 * session alive past the 10-minute access-token expiry — if scheduling
 * breaks, the page silently degrades to 401s mid-session.
 */
import { ApiClientError } from '@/lib/apiBase'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { loginToStoreSession, logoutOfStoreSession } from '../session'

jest.mock('../../api/storeApi', () => ({
  loginToStore: jest.fn(),
  refreshStoreTokens: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const storeApi = require('../../api/storeApi') as {
  loginToStore: jest.Mock
  refreshStoreTokens: jest.Mock
}

const authState = () => useAssetStoreAuthStore.getState()

const session = (n: number) => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}`,
  refreshTokenExpiresAt: 'later',
  username: 'artist',
  role: 'User',
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  useAssetStoreAuthStore.getState().clearSession()
})

afterEach(() => {
  logoutOfStoreSession()
  jest.useRealTimers()
})

describe('loginToStoreSession', () => {
  it('stores the session on success', async () => {
    storeApi.loginToStore.mockResolvedValue(session(1))

    const ok = await loginToStoreSession('me@example.com', 'pw')

    expect(ok).toBe(true)
    expect(authState()).toMatchObject({
      status: 'loggedIn',
      accessToken: 'access-1',
      username: 'artist',
    })
  })

  // Regression: surfacing the raw ApiClientError for a network failure
  // shows axios internals to the user; surfacing a generic message for a
  // 401 hides "wrong password".
  it('keeps the store error message for server rejections', async () => {
    storeApi.loginToStore.mockRejectedValue(
      new ApiClientError('Invalid email or password.', {
        status: 401,
        isNetworkError: false,
        isTimeout: false,
        isOffline: false,
      })
    )

    const ok = await loginToStoreSession('me@example.com', 'pw')

    expect(ok).toBe(false)
    expect(authState().status).toBe('loggedOut')
    expect(authState().error).toBe('Invalid email or password.')
  })

  it('maps network failures to a friendly offline message', async () => {
    storeApi.loginToStore.mockRejectedValue(
      new ApiClientError('Network Error', {
        isNetworkError: true,
        isTimeout: false,
        isOffline: true,
      })
    )

    await loginToStoreSession('me@example.com', 'pw')

    expect(authState().error).toMatch(/could not reach the store/i)
  })
})

describe('refresh loop', () => {
  // Regression: the store's access token dies at 10 minutes — without the
  // 8-minute proactive refresh the session 401s mid-browse.
  it('refreshes tokens before the access token expires and keeps looping', async () => {
    storeApi.loginToStore.mockResolvedValue(session(1))
    storeApi.refreshStoreTokens.mockResolvedValue(session(2))
    await loginToStoreSession('me@example.com', 'pw')

    await jest.advanceTimersByTimeAsync(8 * 60 * 1000)

    expect(storeApi.refreshStoreTokens).toHaveBeenCalledWith('refresh-1')
    expect(authState().accessToken).toBe('access-2')

    storeApi.refreshStoreTokens.mockResolvedValue(session(3))
    await jest.advanceTimersByTimeAsync(8 * 60 * 1000)
    expect(authState().accessToken).toBe('access-3')
  })

  it('logs out when the refresh token is rejected', async () => {
    storeApi.loginToStore.mockResolvedValue(session(1))
    storeApi.refreshStoreTokens.mockRejectedValue(
      new ApiClientError('invalid refresh token', {
        status: 401,
        isNetworkError: false,
        isTimeout: false,
        isOffline: false,
      })
    )
    await loginToStoreSession('me@example.com', 'pw')

    await jest.advanceTimersByTimeAsync(8 * 60 * 1000)

    expect(authState().status).toBe('loggedOut')
    expect(authState().error).toMatch(/session expired/i)
  })

  // Regression: a transient network blip must NOT log the user out — the
  // loop retries sooner instead.
  it('keeps the session and retries after a network failure', async () => {
    storeApi.loginToStore.mockResolvedValue(session(1))
    storeApi.refreshStoreTokens.mockRejectedValueOnce(
      new ApiClientError('offline', {
        isNetworkError: true,
        isTimeout: false,
        isOffline: true,
      })
    )
    await loginToStoreSession('me@example.com', 'pw')

    await jest.advanceTimersByTimeAsync(8 * 60 * 1000)
    expect(authState().status).toBe('loggedIn')

    storeApi.refreshStoreTokens.mockResolvedValue(session(2))
    await jest.advanceTimersByTimeAsync(60 * 1000)
    expect(authState().accessToken).toBe('access-2')
  })

  // Regression: a timer surviving logout would resurrect the session with
  // fresh tokens minted for a user who explicitly signed out.
  it('logout cancels the refresh loop', async () => {
    storeApi.loginToStore.mockResolvedValue(session(1))
    storeApi.refreshStoreTokens.mockResolvedValue(session(2))
    await loginToStoreSession('me@example.com', 'pw')

    logoutOfStoreSession()
    await jest.advanceTimersByTimeAsync(30 * 60 * 1000)

    expect(storeApi.refreshStoreTokens).not.toHaveBeenCalled()
    expect(authState().status).toBe('loggedOut')
  })
})
