import {
  AssetGrid,
  AssetTile,
  AssetTilePlaceholder,
} from '@/shared/components/asset-tile'
import { useAssetStoreImportStore } from '@/stores/assetStoreImportStore'
import { formatFileSize } from '@/utils/fileUtils'

import {
  type ImportedPackId,
  useImportedPackIdResolver,
} from '../lib/importedPack'
import { resolveStorePreviewUrl } from '../lib/storeConfig'
import type { StoreLibraryItem } from '../types'

interface StoreLibraryGridProps {
  items: StoreLibraryItem[]
  /** Open a pack's detail so the user can pick items and import. */
  onOpenPack: (item: StoreLibraryItem) => void
}

/**
 * Read-only status chip for a library tile: Importing… / Imported ✓ / Failed.
 * The actual import (whole pack or selected items) happens in the pack detail -
 * tiles just open it.
 */
function StatusChip({
  item,
  importedPackId,
}: {
  item: StoreLibraryItem
  importedPackId: ImportedPackId | undefined
}) {
  const entry = useAssetStoreImportStore(state => state.imports[item.assetId])

  if (entry && entry.phase !== 'completed' && entry.phase !== 'failed') {
    const label =
      entry.phase === 'importing' && entry.itemsTotal > 0
        ? `${entry.itemsProcessed}/${entry.itemsTotal}`
        : 'Importing…'
    return (
      <span
        className="asset-store-chip"
        data-testid={`asset-store-importing-${item.assetId}`}
      >
        <i className="pi pi-spin pi-spinner" aria-hidden="true" />
        {label}
      </span>
    )
  }

  if (entry?.phase === 'failed') {
    return (
      <span
        className="asset-store-chip asset-store-chip--error"
        title={entry.error ?? 'Import failed'}
        data-testid={`asset-store-import-failed-${item.assetId}`}
      >
        <i className="pi pi-exclamation-triangle" aria-hidden="true" />
        Failed
      </span>
    )
  }

  // Server truth first: a pack that was imported and then DELETED locally
  // resolves to null here while the import store still holds a terminal
  // "completed" entry, and the tile must follow the pack list, not the entry.
  // The entry only stands in while that list is still loading, so a just-finished
  // import doesn't flicker back to un-imported.
  if (
    importedPackId != null ||
    (importedPackId === undefined && entry?.phase === 'completed')
  ) {
    return (
      <span
        className="asset-store-chip asset-store-chip--imported"
        data-testid={`asset-store-imported-${item.assetId}`}
      >
        <i className="pi pi-check" aria-hidden="true" />
        Imported
      </span>
    )
  }

  return null
}

export function StoreLibraryGrid({ items, onOpenPack }: StoreLibraryGridProps) {
  const importedPackIdFor = useImportedPackIdResolver()

  return (
    <AssetGrid className="asset-store-grid">
      {items.map(item => {
        // The store serves relative preview urls unless it has a PublicBaseUrl -
        // resolve them against the store, not against Modelibr's own origin.
        const previewUrl = resolveStorePreviewUrl(item.previewThumbnailUrl)
        return (
          <AssetTile
            key={item.assetId}
            media={
              previewUrl ? (
                <img src={previewUrl} alt={item.title} loading="lazy" />
              ) : (
                <AssetTilePlaceholder icon="pi pi-box" />
              )
            }
            name={item.title}
            meta={`${item.author} · ${formatFileSize(item.totalSize)}`}
            checkbox={
              <StatusChip
                item={item}
                importedPackId={importedPackIdFor(item.assetId)}
              />
            }
            onClick={() => onOpenPack(item)}
            dataAttributes={{ 'data-store-asset-id': item.assetId }}
          />
        )
      })}
    </AssetGrid>
  )
}
