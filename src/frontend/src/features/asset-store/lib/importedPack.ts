import { usePacksQuery } from '@/features/pack/api/queries'

import { getConfiguredStoreUrl, normalizeStoreUrl } from './storeConfig'

/** The local pack imported from a store asset, or `null` when there is none. */
export type ImportedPackId = number | null

/**
 * Resolver: store asset id → the id of the local pack already imported from THIS
 * store (matched by provenance), `null` when none exists, or `undefined` while
 * the local pack list has not loaded yet. Shared by the library grid and the pack
 * detail so "Imported ✓ / Open in library" states stay consistent.
 *
 * The `undefined` case matters: the pack list is SERVER truth and outranks the
 * client-side import store. Deleting an imported pack leaves a terminal
 * "completed" entry behind in that store, and without a way to tell "not
 * imported" from "don't know yet" the tile would keep claiming Imported ✓ for a
 * pack that no longer exists.
 */
export function useImportedPackIdResolver(): (
  assetId: string
) => ImportedPackId | undefined {
  const { data: packs } = usePacksQuery()
  const storeUrl = normalizeStoreUrl(getConfiguredStoreUrl())
  return (assetId: string) => {
    if (!packs) return undefined
    const pack = packs.find(
      p =>
        p.storeImportAssetId === assetId &&
        normalizeStoreUrl(p.storeImportUrl) === storeUrl
    )
    return pack?.id ?? null
  }
}
