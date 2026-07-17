import { create } from 'zustand'

import { queryClient } from '@/lib/react-query'

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

  clearSession: error => {
    // Every logout path (sign-out, refresh failure) funnels through here —
    // drop the cached library so a next login (possibly a different account)
    // can't be served the previous account's data from the 5-min staleTime.
    // Key literal matches getStoreLibraryQueryOptions in
    // features/asset-store/api/queries.ts (importing it here would cycle
    // through storeApi back into this store).
    queryClient.removeQueries({ queryKey: ['store-library'] })
    set({ ...initialState, error: error ?? null })
  },
}))
