/**
 * Persisted Asset Store session. These tests pin the security properties of the
 * persistence, not the happy path: tokens are bearer credentials scoped to one
 * store origin, so rehydrating them anywhere else must not happen.
 */
import * as storeConfig from '@/features/asset-store/lib/storeConfig'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

const STORAGE_KEY = 'modelibr_store_session'

function persistSession(state: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 0 }))
}

function rehydrate() {
  return useAssetStoreAuthStore.persist.rehydrate()
}

beforeEach(() => {
  localStorage.clear()
  jest.restoreAllMocks()
  useAssetStoreAuthStore.setState({
    status: 'loggedOut',
    accessToken: null,
    refreshToken: null,
    username: null,
    storeOrigin: null,
    error: null,
  })
})

describe('session persistence', () => {
  it('restores a session saved for the currently configured store', async () => {
    jest
      .spyOn(storeConfig, 'getConfiguredStoreUrl')
      .mockReturnValue('https://store.test')
    persistSession({
      status: 'loggedIn',
      accessToken: 'a',
      refreshToken: 'r',
      username: 'artist',
      storeOrigin: 'https://store.test',
    })

    await rehydrate()

    expect(useAssetStoreAuthStore.getState()).toMatchObject({
      status: 'loggedIn',
      accessToken: 'a',
      username: 'artist',
    })
  })

  // Regression: tokens were persisted without recording which store minted them.
  // Repointing VITE_STORE_URL then replayed account credentials for store A
  // against store B on the very first request.
  it('discards a session whose store origin no longer matches VITE_STORE_URL', async () => {
    jest
      .spyOn(storeConfig, 'getConfiguredStoreUrl')
      .mockReturnValue('https://other-store.test')
    persistSession({
      status: 'loggedIn',
      accessToken: 'a',
      refreshToken: 'r',
      username: 'artist',
      storeOrigin: 'https://store.test',
    })

    await rehydrate()

    const state = useAssetStoreAuthStore.getState()
    expect(state.status).toBe('loggedOut')
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
  })

  it('discards a session when the store URL has been unset entirely', async () => {
    jest.spyOn(storeConfig, 'getConfiguredStoreUrl').mockReturnValue(null)
    persistSession({
      status: 'loggedIn',
      accessToken: 'a',
      refreshToken: 'r',
      username: 'artist',
      storeOrigin: 'https://store.test',
    })

    await rehydrate()

    expect(useAssetStoreAuthStore.getState().status).toBe('loggedOut')
  })

  // Sessions written before storeOrigin existed carry no binding and cannot be
  // proven to belong to the configured store — one re-login is the safe answer.
  it('discards a legacy session that recorded no store origin', async () => {
    jest
      .spyOn(storeConfig, 'getConfiguredStoreUrl')
      .mockReturnValue('https://store.test')
    persistSession({
      status: 'loggedIn',
      accessToken: 'a',
      refreshToken: 'r',
      username: 'artist',
    })

    await rehydrate()

    expect(useAssetStoreAuthStore.getState().status).toBe('loggedOut')
  })
})

describe('setTokens', () => {
  // Regression: a refresh that resolved after logout+login-as-someone-else
  // overwrote the new session's tokens with the old account's.
  it('ignores a refresh result for a session that is no longer current', () => {
    useAssetStoreAuthStore.getState().setSession({
      accessToken: 'b-access',
      refreshToken: 'b-refresh',
      username: 'account-b',
    })

    useAssetStoreAuthStore.getState().setTokens({
      accessToken: 'a-access-2',
      refreshToken: 'a-refresh-2',
      previousRefreshToken: 'a-refresh',
    })

    expect(useAssetStoreAuthStore.getState().accessToken).toBe('b-access')
  })

  it('applies a refresh result for the current session', () => {
    useAssetStoreAuthStore.getState().setSession({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      username: 'artist',
    })

    useAssetStoreAuthStore.getState().setTokens({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      previousRefreshToken: 'refresh-1',
    })

    expect(useAssetStoreAuthStore.getState()).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    })
  })
})
