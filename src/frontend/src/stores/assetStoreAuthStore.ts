import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  getConfiguredStoreUrl,
  normalizeStoreUrl,
} from '@/features/asset-store/lib/storeConfig'
import { queryClient } from '@/lib/react-query'

/**
 * Asset Store session state. The session is PERSISTED to localStorage (tokens +
 * username) so a page reload or app restart keeps you signed in — the store's
 * refresh token is long-lived (7 days), and this is a local-first, self-hosted
 * app. On startup `resumeStoreSession()` (features/asset-store/lib/session)
 * refreshes the stale access token and re-arms the proactive refresh loop.
 *
 * Tokens are BOUND to the store origin they were minted for (`storeOrigin`).
 * Bearer credentials are origin-scoped secrets: if VITE_STORE_URL later points
 * somewhere else, the persisted session is dropped on rehydrate rather than
 * replayed against a different store.
 */

export type AssetStoreAuthStatus = 'loggedOut' | 'loggingIn' | 'loggedIn'

interface AssetStoreAuthState {
  status: AssetStoreAuthStatus
  accessToken: string | null
  refreshToken: string | null
  username: string | null
  /** Normalized origin these tokens belong to; null when logged out. */
  storeOrigin: string | null
  /** Last login/refresh failure, shown by the login form. */
  error: string | null
  beginLogin: () => void
  setSession: (session: {
    accessToken: string
    refreshToken: string
    username: string
  }) => void
  /**
   * Refresh rotates both tokens without touching status/username. `previousRefreshToken`
   * identifies the session the refresh was started for — a result that arrives after a
   * logout (and possibly a login as someone else) is discarded instead of overwriting
   * the newer session's tokens.
   */
  setTokens: (tokens: {
    accessToken: string
    refreshToken: string
    previousRefreshToken: string
  }) => void
  setLoginError: (message: string) => void
  clearSession: (error?: string) => void
}

const initialState = {
  status: 'loggedOut' as AssetStoreAuthStatus,
  accessToken: null,
  refreshToken: null,
  username: null,
  storeOrigin: null,
  error: null,
}

export const useAssetStoreAuthStore = create<AssetStoreAuthState>()(
  persist(
    set => ({
      ...initialState,

      beginLogin: () => set({ status: 'loggingIn', error: null }),

      setSession: ({ accessToken, refreshToken, username }) =>
        set({
          status: 'loggedIn',
          accessToken,
          refreshToken,
          username,
          storeOrigin: normalizeStoreUrl(getConfiguredStoreUrl()),
          error: null,
        }),

      setTokens: ({ accessToken, refreshToken, previousRefreshToken }) =>
        set(state =>
          // A logout — or a logout followed by a login as another account — that
          // raced the refresh wins. The refresh token identifies the session, so a
          // late response for a session that is gone is dropped, never applied on
          // top of the newer one.
          state.status === 'loggedIn' &&
          state.refreshToken === previousRefreshToken
            ? { accessToken, refreshToken }
            : state
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
    }),
    {
      name: 'modelibr_store_session',
      storage: createJSONStorage(() => localStorage),
      // Persist only durable session fields — never the transient 'loggingIn'
      // status or the last error message.
      partialize: state => ({
        status: state.status === 'loggedIn' ? 'loggedIn' : 'loggedOut',
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        username: state.username,
        storeOrigin: state.storeOrigin,
      }),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<AssetStoreAuthState>) ?? {}
        const configuredOrigin = normalizeStoreUrl(getConfiguredStoreUrl())
        // Only a session WITH both tokens, minted for the CURRENTLY configured
        // store, counts as logged in on rehydrate. A changed or removed
        // VITE_STORE_URL invalidates the persisted tokens instead of letting them
        // be sent to a different origin. (Sessions saved before storeOrigin
        // existed have none recorded and are likewise discarded — one re-login.)
        const loggedIn =
          saved.status === 'loggedIn' &&
          !!saved.accessToken &&
          !!saved.refreshToken &&
          !!saved.storeOrigin &&
          saved.storeOrigin === configuredOrigin
        return {
          ...current,
          status: loggedIn ? 'loggedIn' : 'loggedOut',
          accessToken: loggedIn ? (saved.accessToken ?? null) : null,
          refreshToken: loggedIn ? (saved.refreshToken ?? null) : null,
          username: loggedIn ? (saved.username ?? null) : null,
          storeOrigin: loggedIn ? (saved.storeOrigin ?? null) : null,
          error: null,
        }
      },
    }
  )
)
