import { ApiClientError } from '@/lib/apiBase'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { loginToStore, refreshStoreTokensOnce } from '../api/storeApi'
import { isTerminalAuthFailure } from './authFailure'

/**
 * Store session lifecycle: login/logout plus the proactive access-token
 * refresh loop. The store's access tokens expire after 10 minutes (store
 * contract, Jwt ExpiryMinutes) - refresh at 8 so a request never races the
 * expiry; the 401-retry interceptor in storeApi covers the remaining gap.
 */
const ACCESS_TOKEN_REFRESH_MS = 8 * 60 * 1000

let refreshTimer: ReturnType<typeof setTimeout> | null = null

function cancelRefreshLoop(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

function scheduleRefresh(): void {
  cancelRefreshLoop()
  refreshTimer = setTimeout(() => {
    void refreshSession()
  }, ACCESS_TOKEN_REFRESH_MS)
}

async function refreshSession(): Promise<void> {
  const auth = useAssetStoreAuthStore.getState()
  if (auth.status !== 'loggedIn' || !auth.refreshToken) {
    cancelRefreshLoop()
    return
  }

  // Identifies the session this refresh belongs to, for both the success and the
  // failure path below.
  const startedWith = auth.refreshToken

  try {
    // Single-flight (shared with the 401-retry interceptor): a store that
    // rotates refresh tokens must never receive the same token twice.
    const refreshed = await refreshStoreTokensOnce(startedWith)
    useAssetStoreAuthStore.getState().setTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      previousRefreshToken: startedWith,
    })
    // Re-arm only when OUR tokens are the ones that landed. A logout - or a
    // login as someone else - that raced this refresh wins, and that newer
    // session already armed its own timer; re-arming here would run two loops
    // against one refresh token.
    if (
      useAssetStoreAuthStore.getState().refreshToken === refreshed.refreshToken
    ) {
      scheduleRefresh()
    }
  } catch (error) {
    const current = useAssetStoreAuthStore.getState()
    // Not our session any more - whatever happened to this refresh is no longer
    // anyone's business, and acting on it would disturb the newer session.
    if (current.refreshToken !== startedWith) return

    // Only an auth rejection means the token is dead. Network trouble, a
    // rate-limited store (429) or a restarting one (5xx) retry sooner and leave
    // the session up - the 401-retry interceptor still guards individual calls.
    if (!isTerminalAuthFailure(error)) {
      if (current.status === 'loggedIn') {
        refreshTimer = setTimeout(() => void refreshSession(), 60 * 1000)
      }
      return
    }

    cancelRefreshLoop()
    current.clearSession('Your store session expired. Please sign in again.')
  }
}

export async function loginToStoreSession(
  email: string,
  password: string
): Promise<boolean> {
  const store = useAssetStoreAuthStore.getState()
  store.beginLogin()
  try {
    const session = await loginToStore(email, password)
    useAssetStoreAuthStore.getState().setSession({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      username: session.username,
    })
    scheduleRefresh()
    return true
  } catch (error) {
    const message =
      error instanceof ApiClientError && !error.isNetworkError
        ? error.message
        : 'Could not reach the store. Check your connection and try again.'
    useAssetStoreAuthStore.getState().setLoginError(message)
    return false
  }
}

export function logoutOfStoreSession(): void {
  cancelRefreshLoop()
  useAssetStoreAuthStore.getState().clearSession()
}

/**
 * Resumes a persisted session on app startup: the stored access token is likely
 * expired after a reload/restart, so refresh once now and re-arm the proactive
 * refresh loop (which is otherwise only started on an interactive login). A
 * refresh REJECTED by the store clears the session; anything transient (offline,
 * 429, 5xx) keeps it and retries.
 */
export function resumeStoreSession(): void {
  const auth = useAssetStoreAuthStore.getState()
  if (auth.status !== 'loggedIn' || !auth.refreshToken) return
  scheduleRefresh()
  void refreshSession()
}
