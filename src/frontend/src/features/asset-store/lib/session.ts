import { ApiClientError } from '@/lib/apiBase'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { loginToStore, refreshStoreTokensOnce } from '../api/storeApi'

/**
 * Store session lifecycle: login/logout plus the proactive access-token
 * refresh loop. The store's access tokens expire after 10 minutes (store
 * contract, Jwt ExpiryMinutes) — refresh at 8 so a request never races the
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

  try {
    // Single-flight (shared with the 401-retry interceptor): a store that
    // rotates refresh tokens must never receive the same token twice.
    const refreshed = await refreshStoreTokensOnce(auth.refreshToken)
    useAssetStoreAuthStore.getState().setTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
    })
    // A logout that raced the in-flight refresh wins — don't re-arm a timer
    // for a session that no longer exists.
    if (useAssetStoreAuthStore.getState().status === 'loggedIn') {
      scheduleRefresh()
    }
  } catch (error) {
    // A rejected refresh token means the session is gone; transient network
    // trouble just retries sooner and leaves the session up (the 401-retry
    // interceptor still guards individual calls).
    if (error instanceof ApiClientError && error.isNetworkError) {
      if (useAssetStoreAuthStore.getState().status === 'loggedIn') {
        refreshTimer = setTimeout(() => void refreshSession(), 60 * 1000)
      }
      return
    }
    cancelRefreshLoop()
    useAssetStoreAuthStore
      .getState()
      .clearSession('Your store session expired. Please sign in again.')
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
 * rejected refresh token clears the session; a network error keeps it and retries.
 */
export function resumeStoreSession(): void {
  const auth = useAssetStoreAuthStore.getState()
  if (auth.status !== 'loggedIn' || !auth.refreshToken) return
  scheduleRefresh()
  void refreshSession()
}
