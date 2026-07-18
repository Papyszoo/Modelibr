import {
  AssetGrid,
  AssetTile,
  AssetTilePlaceholder,
} from '@/shared/components/asset-tile'
import { useAssetStoreImportStore } from '@/stores/assetStoreImportStore'
import { formatFileSize } from '@/utils/fileUtils'

import { useImportedPackIdResolver } from '../lib/importedPack'
import type { StoreLibraryItem } from '../types'

interface StoreLibraryGridProps {
  items: StoreLibraryItem[]
  /** Open a pack's detail so the user can pick items and import. */
  onOpenPack: (item: StoreLibraryItem) => void
}

/**
 * Read-only status chip for a library tile: Importing… / Imported ✓ / Failed.
 * The actual import (whole pack or selected items) happens in the pack detail —
 * tiles just open it.
 */
function StatusChip({
  item,
  importedPackId,
}: {
  item: StoreLibraryItem
  importedPackId: number | null
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

  if (importedPackId !== null || entry?.phase === 'completed') {
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
      {items.map(item => (
        <AssetTile
          key={item.assetId}
          media={
            item.previewThumbnailUrl ? (
              <img
                src={item.previewThumbnailUrl}
                alt={item.title}
                loading="lazy"
              />
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
      ))}
    </AssetGrid>
  )
}
