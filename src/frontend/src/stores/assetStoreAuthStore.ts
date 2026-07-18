import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { queryClient } from '@/lib/react-query'

/**
 * Asset Store session state. The session is PERSISTED to localStorage (tokens +
 * username) so a page reload or app restart keeps you signed in — the store's
 * refresh token is long-lived (7 days), and this is a local-first, self-hosted
 * app. On startup `resumeStoreSession()` (features/asset-store/lib/session)
 * refreshes the stale access token and re-arms the proactive refresh loop.
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
      }),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<AssetStoreAuthState>) ?? {}
        // Only a session WITH both tokens counts as logged in on rehydrate.
        const loggedIn =
          saved.status === 'loggedIn' &&
          !!saved.accessToken &&
          !!saved.refreshToken
        return {
          ...current,
          status: loggedIn ? 'loggedIn' : 'loggedOut',
          accessToken: loggedIn ? (saved.accessToken ?? null) : null,
          refreshToken: loggedIn ? (saved.refreshToken ?? null) : null,
          username: loggedIn ? (saved.username ?? null) : null,
          error: null,
        }
      },
    }
  )
)
