import { Button } from 'primereact/button'

import { usePacksQuery } from '@/features/pack/api/queries'
import {
  AssetGrid,
  AssetTile,
  AssetTilePlaceholder,
} from '@/shared/components/asset-tile'
import {
  useAssetStoreImportStore,
  type AssetStoreImportEntry,
} from '@/stores/assetStoreImportStore'
import { openTabInPanel } from '@/utils/tabNavigation'
import { formatFileSize } from '@/utils/fileUtils'

import { startImport } from '../lib/importController'
import { getConfiguredStoreUrl, normalizeStoreUrl } from '../lib/storeConfig'
import type { StoreLibraryItem } from '../types'

interface StoreLibraryGridProps {
  items: StoreLibraryItem[]
}

/** Pack id of the already-imported pack for a store item, or null. */
function useImportedPackId(): (assetId: string) => number | null {
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

function openImportedPack(packId: number, title: string): void {
  openTabInPanel('packViewer', 'left', packId.toString(), title)
}

/**
 * Corner action for one library tile: Import / progress / Imported ✓ /
 * Re-import / Open in library, driven by the import store + pack provenance.
 */
function ImportAction({
  item,
  entry,
  importedPackId,
}: {
  item: StoreLibraryItem
  entry: AssetStoreImportEntry | undefined
  importedPackId: number | null
}) {
  const importLabel = importedPackId !== null ? 'Re-import' : 'Import'

  if (!entry || entry.phase === 'failed') {
    return (
      <span className="asset-store-action">
        {entry?.phase === 'failed' && (
          <span
            className="asset-store-chip asset-store-chip--error"
            title={entry.error ?? 'Import failed'}
            data-testid={`asset-store-import-failed-${item.assetId}`}
          >
            <i className="pi pi-exclamation-triangle" aria-hidden="true" />
            Failed
          </span>
        )}
        {!entry && importedPackId !== null && (
          <span
            className="asset-store-chip asset-store-chip--imported"
            data-testid={`asset-store-imported-${item.assetId}`}
          >
            <i className="pi pi-check" aria-hidden="true" />
            Imported
          </span>
        )}
        <Button
          label={entry?.phase === 'failed' ? 'Retry' : importLabel}
          icon="pi pi-download"
          size="small"
          outlined={importedPackId !== null && entry?.phase !== 'failed'}
          onClick={e => {
            e.stopPropagation()
            void startImport(item)
          }}
          data-testid={`asset-store-import-${item.assetId}`}
        />
      </span>
    )
  }

  if (entry.phase === 'completed') {
    return (
      <span className="asset-store-action">
        <Button
          label="Open in library"
          icon="pi pi-folder-open"
          size="small"
          onClick={e => {
            e.stopPropagation()
            if (entry.packId !== null) {
              openImportedPack(entry.packId, item.title)
            }
          }}
          data-testid={`asset-store-open-${item.assetId}`}
        />
      </span>
    )
  }

  const progressLabel =
    entry.phase === 'importing' && entry.itemsTotal > 0
      ? `${entry.itemsProcessed}/${entry.itemsTotal}`
      : 'Importing…'
  return (
    <span className="asset-store-action">
      <span
        className="asset-store-chip"
        data-testid={`asset-store-importing-${item.assetId}`}
      >
        <i className="pi pi-spin pi-spinner" aria-hidden="true" />
        {progressLabel}
      </span>
    </span>
  )
}

export function StoreLibraryGrid({ items }: StoreLibraryGridProps) {
  const imports = useAssetStoreImportStore(state => state.imports)
  const importedPackIdFor = useImportedPackId()

  return (
    <AssetGrid className="asset-store-grid">
      {items.map(item => {
        const entry = imports[item.assetId]
        const importedPackId = importedPackIdFor(item.assetId)
        const openablePackId =
          entry?.phase === 'completed' && entry.packId !== null
            ? entry.packId
            : importedPackId

        return (
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
              <ImportAction
                item={item}
                entry={entry}
                importedPackId={importedPackId}
              />
            }
            onClick={
              openablePackId !== null
                ? () => openImportedPack(openablePackId, item.title)
                : undefined
            }
            dataAttributes={{ 'data-store-asset-id': item.assetId }}
          />
        )
      })}
    </AssetGrid>
  )
}
