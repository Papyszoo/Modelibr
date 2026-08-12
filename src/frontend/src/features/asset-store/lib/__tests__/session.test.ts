/**
 * Session lifecycle tests: the proactive refresh loop is what keeps a store
 * session alive past the 10-minute access-token expiry — if scheduling
 * breaks, the page silently degrades to 401s mid-session.
 */
import { ApiClientError } from '@/lib/apiBase'
import { queryClient } from '@/lib/react-query'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import {
  loginToStoreSession,
  logoutOfStoreSession,
  resumeStoreSession,
} from '../session'

jest.mock('../../api/storeApi', () => ({
  loginToStore: jest.fn(),
  refreshStoreTokensOnce: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const storeApi = require('../../api/storeApi') as {
  loginToStore: jest.Mock
  refreshStoreTokensOnce: jest.Mock
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
    storeApi.refreshStoreTokensOnce.mockResolvedValue(session(2))
    await loginToStoreSession('me@example.com', 'pw')

    await jest.advanceTimersByTimeAsync(8 * 60 * 1000)

    expect(storeApi.refreshStoreTokensOnce).toHaveBeenCalledWith('refresh-1')
    expect(authState().accessToken).toBe('access-2')

    storeApi.refreshStoreTokensOnce.mockResolvedValue(session(3))
    await jest.advanceTimersByTimeAsync(8 * 60 * 1000)
    expect(authState().accessToken).toBe('access-3')
  })

  it('logs out when the refresh token is rejected', async () => {
    storeApi.loginToStore.mockResolvedValue(session(1))
    storeApi.refreshStoreTokensOnce.mockRejectedValue(
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
    storeApi.refreshStoreTokensOnce.mockRejectedValueOnce(
      new ApiClientError('offline', {
        isNetworkError: true,
        isTimeout: false,
        isOffline: true,
      })
    )
    await loginToStoreSession('me@example.com', 'pw')

    await jest.advanceTimersByTimeAsync(8 * 60 * 1000)
    expect(authState().status).toBe('loggedIn')

    storeApi.refreshStoreTokensOnce.mockResolvedValue(session(2))
    await jest.advanceTimersByTimeAsync(60 * 1000)
    expect(authState().accessToken).toBe('access-2')
  })

  // Regression: a timer surviving logout would resurrect the session with
  // fresh tokens minted for a user who explicitly signed out.
  it('logout cancels the refresh loop', async () => {
    storeApi.loginToStore.mockResolvedValue(session(1))
    storeApi.refreshStoreTokensOnce.mockResolvedValue(session(2))
    await loginToStoreSession('me@example.com', 'pw')

    logoutOfStoreSession()
    await jest.advanceTimersByTimeAsync(30 * 60 * 1000)

    expect(storeApi.refreshStoreTokensOnce).not.toHaveBeenCalled()
    expect(authState().status).toBe('loggedOut')
  })

  // Regression: a 429 from a rate-limited store, or a 5xx from one that is
  // restarting, used to be treated as "refresh token rejected" and signed the
  // user out of a session that was still perfectly valid.
  it.each([
    [429, 'Too many requests'],
    [503, 'Service unavailable'],
  ])(
    'keeps the session after a transient %i from the store',
    async (status, message) => {
      storeApi.loginToStore.mockResolvedValue(session(1))
      storeApi.refreshStoreTokensOnce.mockRejectedValueOnce(
        new ApiClientError(message, {
          status,
          isNetworkError: false,
          isTimeout: false,
          isOffline: false,
        })
      )
      await loginToStoreSession('me@example.com', 'pw')

      await jest.advanceTimersByTimeAsync(8 * 60 * 1000)
      expect(authState().status).toBe('loggedIn')
      expect(authState().accessToken).toBe('access-1')

      // ...and the loop retries a minute later rather than giving up.
      storeApi.refreshStoreTokensOnce.mockResolvedValue(session(2))
      await jest.advanceTimersByTimeAsync(60 * 1000)
      expect(authState().accessToken).toBe('access-2')
    }
  )

  // Regression: account A's refresh failing AFTER the user signed in as account
  // B cleared B's brand-new session.
  it('does not clear a newer session when an older refresh fails late', async () => {
    storeApi.loginToStore.mockResolvedValue(session(1))
    let rejectRefresh: (reason: unknown) => void = () => {}
    storeApi.refreshStoreTokensOnce.mockReturnValue(
      new Promise((_, reject) => (rejectRefresh = reject))
    )
    await loginToStoreSession('me@example.com', 'pw')

    await jest.advanceTimersByTimeAsync(8 * 60 * 1000) // account A refresh in flight

    // The user signs out and back in as someone else while it is open.
    logoutOfStoreSession()
    useAssetStoreAuthStore.getState().setSession({
      accessToken: 'access-B',
      refreshToken: 'refresh-B',
      username: 'other-artist',
    })

    rejectRefresh(
      new ApiClientError('invalid refresh token', {
        status: 401,
        isNetworkError: false,
        isTimeout: false,
        isOffline: false,
      })
    )
    await jest.advanceTimersByTimeAsync(0)

    expect(authState().status).toBe('loggedIn')
    expect(authState().accessToken).toBe('access-B')
    expect(authState().error).toBeNull()
  })

  // Regression: a logout racing an IN-FLIGHT refresh used to re-arm the
  // 8-minute timer for a session that no longer existed.
  it('does not re-arm the loop when logout raced an in-flight refresh', async () => {
    storeApi.loginToStore.mockResolvedValue(session(1))
    let resolveRefresh: (value: unknown) => void = () => {}
    storeApi.refreshStoreTokensOnce.mockReturnValue(
      new Promise(resolve => (resolveRefresh = resolve))
    )
    await loginToStoreSession('me@example.com', 'pw')

    await jest.advanceTimersByTimeAsync(8 * 60 * 1000) // refresh in flight
    logoutOfStoreSession()
    resolveRefresh(session(2))
    await jest.advanceTimersByTimeAsync(0)

    expect(authState().status).toBe('loggedOut')
    expect(authState().accessToken).toBeNull()
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('resumeStoreSession', () => {
  // Regression: after a reload the in-memory refresh loop is gone and the
  // persisted access token is stale — resume must refresh once and re-arm it,
  // or the session degrades to 401-retries (and "logs out too quickly").
  it('refreshes the stale token and re-arms the loop for a persisted session', async () => {
    storeApi.refreshStoreTokensOnce.mockResolvedValue(session(2))
    // Simulate a rehydrated logged-in session (no refresh loop armed yet).
    useAssetStoreAuthStore.getState().setSession({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      username: 'artist',
    })

    resumeStoreSession()
    await jest.advanceTimersByTimeAsync(0)

    expect(storeApi.refreshStoreTokensOnce).toHaveBeenCalledWith('refresh-1')
    expect(authState().accessToken).toBe('access-2')

    // The proactive loop keeps running past resume.
    storeApi.refreshStoreTokensOnce.mockResolvedValue(session(3))
    await jest.advanceTimersByTimeAsync(8 * 60 * 1000)
    expect(authState().accessToken).toBe('access-3')
  })

  it('is a no-op when there is no persisted session', async () => {
    resumeStoreSession()
    await jest.advanceTimersByTimeAsync(0)

    expect(storeApi.refreshStoreTokensOnce).not.toHaveBeenCalled()
    expect(authState().status).toBe('loggedOut')
  })
})

describe('logout cache hygiene', () => {
  // Regression: the cached library survived logout — with the app's 5-minute
  // staleTime, a different account logging in could be shown the previous
  // account's library.
  it('drops the cached store library on logout', async () => {
    const removeSpy = jest.spyOn(queryClient, 'removeQueries')
    storeApi.loginToStore.mockResolvedValue(session(1))
    await loginToStoreSession('me@example.com', 'pw')

    logoutOfStoreSession()

    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ['store-library'] })
    removeSpy.mockRestore()
  })
})
