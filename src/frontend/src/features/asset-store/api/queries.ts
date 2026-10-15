import { queryOptions, useQuery } from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { getStoreAsset, getStoreCatalog, getStoreLibrary } from './storeApi'

// --- Store library (server state on the STORE origin) ---

export const STORE_LIBRARY_PAGE_SIZE = 48
export const STORE_CATALOG_PAGE_SIZE = 48

export function getStoreLibraryQueryOptions(page: number) {
  return queryOptions({
    queryKey: ['store-library', page] as const,
    queryFn: () => getStoreLibrary(page, STORE_LIBRARY_PAGE_SIZE),
  })
}

export function getStoreCatalogQueryOptions(page: number) {
  return queryOptions({
    queryKey: ['store-catalog', page] as const,
    queryFn: () => getStoreCatalog(page, STORE_CATALOG_PAGE_SIZE),
  })
}

type UseStoreLibraryQueryOptions = {
  page?: number
  queryConfig?: QueryConfig<typeof getStoreLibraryQueryOptions>
}

export function useStoreLibraryQuery({
  page = 1,
  queryConfig = {},
}: UseStoreLibraryQueryOptions = {}) {
  const isLoggedIn = useAssetStoreAuthStore(
    state => state.status === 'loggedIn'
  )
  return useQuery({
    ...getStoreLibraryQueryOptions(page),
    enabled: isLoggedIn,
    // Keep the previous page's tiles on screen while the next page loads.
    placeholderData: previousData => previousData,
    ...queryConfig,
  })
}

type UseStoreCatalogQueryOptions = {
  page?: number
  queryConfig?: QueryConfig<typeof getStoreCatalogQueryOptions>
}

/**
 * The public catalog, for a visitor who has not signed in. Disabled while a
 * session exists (the library is the right surface then) and while a login is
 * in flight, so a successful sign-in never races a stale catalog response into
 * the grid.
 */
export function useStoreCatalogQuery({
  page = 1,
  queryConfig = {},
}: UseStoreCatalogQueryOptions = {}) {
  const isSignedOut = useAssetStoreAuthStore(
    state => state.status === 'loggedOut'
  )
  return useQuery({
    ...getStoreCatalogQueryOptions(page),
    enabled: isSignedOut,
    // Keep the previous page's tiles on screen while the next page loads.
    placeholderData: previousData => previousData,
    ...queryConfig,
  })
}

// --- Store asset detail (items to pick from before importing) ---

export function getStoreAssetQueryOptions(assetId: string) {
  return queryOptions({
    queryKey: ['store-asset', assetId] as const,
    queryFn: () => getStoreAsset(assetId),
  })
}

export function useStoreAssetQuery(assetId: string | null) {
  // The detail endpoint is public: signed-out browsing opens the same pick
  // list, and texturing packs must be inspectable before any account exists.
  return useQuery({
    ...getStoreAssetQueryOptions(assetId ?? ''),
    enabled: !!assetId,
  })
}
