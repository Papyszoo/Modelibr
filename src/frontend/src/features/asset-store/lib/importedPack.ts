import { usePacksQuery } from '@/features/pack/api/queries'

import { getConfiguredStoreUrl, normalizeStoreUrl } from './storeConfig'

/**
 * Resolver: store asset id → the id of the local pack already imported from THIS
 * store (matched by provenance), or null. Shared by the library grid and the pack
 * detail so "Imported ✓ / Open in library" states stay consistent.
 */
export function useImportedPackIdResolver(): (
  assetId: string
) => number | null {
  const { data: packs } = usePacksQuery()
  const storeUrl = normalizeStoreUrl(getConfiguredStoreUrl())
  return (assetId: string) => {
    const pack = packs?.find(
      p =>
        p.storeImportAssetId === assetId &&
        normalizeStoreUrl(p.storeImportUrl) === storeUrl
    )
    return pack?.id ?? null
  }
}
