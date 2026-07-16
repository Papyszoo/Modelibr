import { queryOptions, useQuery } from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { getStoreLibrary } from './storeApi'

// --- Store library (server state on the STORE origin) ---

export const STORE_LIBRARY_PAGE_SIZE = 48

export function getStoreLibraryQueryOptions(page: number) {
  return queryOptions({
    queryKey: ['store-library', page] as const,
    queryFn: () => getStoreLibrary(page, STORE_LIBRARY_PAGE_SIZE),
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
    ...queryConfig,
  })
}
