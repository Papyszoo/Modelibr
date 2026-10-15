/**
 * Persisted Asset Store session. These tests pin the security properties of the
 * persistence, not the happy path: tokens are bearer credentials scoped to one
 * store origin, so rehydrating them anywhere else must not happen.
 */
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
  it('restores a session saved for the store', async () => {
    persistSession({
      status: 'loggedIn',
      accessToken: 'a',
      refreshToken: 'r',
      username: 'artist',
      storeOrigin: 'https://store.modelibr.com',
    })

    await rehydrate()

    expect(useAssetStoreAuthStore.getState()).toMatchObject({
      status: 'loggedIn',
      accessToken: 'a',
      username: 'artist',
    })
  })

  // Regression: tokens were persisted without recording which store minted them,
  // so credentials for store A could be replayed against store B on the first
  // request. A session whose recorded origin is not Modelibr's store is dropped.
  it('discards a session minted for a different store', async () => {
    persistSession({
      status: 'loggedIn',
      accessToken: 'a',
      refreshToken: 'r',
      username: 'artist',
      storeOrigin: 'https://other-store.test',
    })

    await rehydrate()

    const state = useAssetStoreAuthStore.getState()
    expect(state.status).toBe('loggedOut')
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
  })

  // Sessions written before storeOrigin existed carry no binding and cannot be
  // proven to belong to the store - one re-login is the safe answer.
  it('discards a legacy session that recorded no store origin', async () => {
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
