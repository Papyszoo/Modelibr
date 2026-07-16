import { create } from 'zustand'

/**
 * Asset Store session state. Tokens live in MEMORY ONLY — never localStorage,
 * never cookies (store CORS is credential-less by design; a persisted token
 * would outlive the page's control over it). Logging in again after an app
 * restart is the accepted v0.5 trade-off.
 */

export type AssetStoreAuthStatus = 'loggedOut' | 'loggingIn' | 'loggedIn'

interface AssetStoreAuthState {
  status: AssetStoreAuthStatus
  accessToken: string | null
  refreshToken: string | null
  username: string | null
  /** Last login/refresh failure, shown by the login form. */
  error: string | null
  beginLogin: () => void
  setSession: (session: {
    accessToken: string
    refreshToken: string
    username: string
  }) => void
  /** Refresh rotates both tokens without touching status/username. */
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void
  setLoginError: (message: string) => void
  clearSession: (error?: string) => void
}

const initialState = {
  status: 'loggedOut' as AssetStoreAuthStatus,
  accessToken: null,
  refreshToken: null,
  username: null,
  error: null,
}

export const useAssetStoreAuthStore = create<AssetStoreAuthState>(set => ({
  ...initialState,

  beginLogin: () => set({ status: 'loggingIn', error: null }),

  setSession: ({ accessToken, refreshToken, username }) =>
    set({
      status: 'loggedIn',
      accessToken,
      refreshToken,
      username,
      error: null,
    }),

  setTokens: ({ accessToken, refreshToken }) =>
    set(state =>
      // A logout that raced the refresh wins — don't resurrect the session.
      state.status === 'loggedIn' ? { accessToken, refreshToken } : state
    ),

  setLoginError: message =>
    set({ ...initialState, status: 'loggedOut', error: message }),

  clearSession: error => set({ ...initialState, error: error ?? null }),
}))
