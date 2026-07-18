import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { useMemo, useState } from 'react'

import { EmptyState, ErrorState, LoadingState } from '@/shared/components'
import { useAssetStoreImportStore } from '@/stores/assetStoreImportStore'
import { formatFileSize } from '@/utils/fileUtils'
import { openTabInPanel } from '@/utils/tabNavigation'

import { useStoreAssetQuery } from '../api/queries'
import { startImport } from '../lib/importController'
import { useImportedPackIdResolver } from '../lib/importedPack'
import type { StoreAssetItem, StoreLibraryItem } from '../types'

interface StorePackDetailProps {
  item: StoreLibraryItem
  onBack: () => void
}

/** Friendly label for a manifest item type ("EnvironmentMap" → "Environment Map"). */
function itemTypeLabel(itemType: string): string {
  return itemType.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function sumItemSize(
  item: StoreAssetItem,
  fileSizeById: Map<string, number>
): number {
  return item.fileIds.reduce((sum, id) => sum + (fileSizeById.get(id) ?? 0), 0)
}

/**
 * A store pack's contents: the user ticks the items they want, then imports just
 * those (or the whole pack). Reached by clicking a library tile. Import progress
 * is shared with the grid via useAssetStoreImportStore (keyed by pack asset id).
 */
export function StorePackDetail({ item, onBack }: StorePackDetailProps) {
  const detail = useStoreAssetQuery(item.assetId)
  const entry = useAssetStoreImportStore(state => state.imports[item.assetId])
  const importedPackId = useImportedPackIdResolver()(item.assetId)

  const items = useMemo(() => detail.data?.items ?? [], [detail.data])
  const fileSizeById = useMemo(() => {
    const map = new Map<string, number>()
    for (const file of detail.data?.files ?? []) map.set(file.id, file.fileSize)
    return map
  }, [detail.data])
  const previewByItemId = useMemo(() => {
    const map = new Map<string, string>()
    for (const preview of detail.data?.previews ?? []) {
      if (preview.packItemId && !map.has(preview.packItemId)) {
        map.set(preview.packItemId, preview.url)
      }
    }
    return map
  }, [detail.data])

  // null = "all selected" (the default); a Set once the user starts toggling.
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const allIds = useMemo(() => items.map(i => i.id), [items])
  const selectedSet = selected ?? new Set(allIds)
  const selectedIds = allIds.filter(id => selectedSet.has(id))
  const allSelected = selectedIds.length === allIds.length && allIds.length > 0

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev ?? allIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () =>
    setSelected(allSelected ? new Set<string>() : new Set(allIds))

  const isImporting =
    !!entry && entry.phase !== 'completed' && entry.phase !== 'failed'
  const openInLibrary = () => {
    const packId = entry?.packId ?? importedPackId
    if (packId !== null && packId !== undefined) {
      openTabInPanel('packViewer', 'left', packId.toString(), item.title)
    }
  }

  const runImport = () => {
    // No item list (single asset) or every item ticked → import the whole pack
    // (undefined selection). Otherwise send just the picked item ids.
    const ids = items.length === 0 || allSelected ? undefined : selectedIds
    void startImport(item, ids)
  }

  const header = (
    <div className="asset-store-detail-head">
      <Button
        icon="pi pi-arrow-left"
        label="Back"
        size="small"
        text
        onClick={onBack}
        data-testid="asset-store-detail-back"
      />
      <div className="asset-store-detail-title">
        <span className="asset-store-detail-name" title={item.title}>
          {item.title}
        </span>
        <span className="asset-store-detail-author">{item.author}</span>
      </div>
      {(importedPackId !== null || entry?.phase === 'completed') && (
        <Button
          label="Open in library"
          icon="pi pi-folder-open"
          size="small"
          text
          onClick={openInLibrary}
          data-testid="asset-store-detail-open"
        />
      )}
    </div>
  )

  const renderBody = () => {
    if (detail.isPending) {
      return <LoadingState message="Loading pack contents…" />
    }
    if (detail.isError) {
      return (
        <ErrorState
          title="Could not load this pack"
          message="The store may be down, or you may be offline. Your local assets are unaffected."
          onRetry={() => void detail.refetch()}
        />
      )
    }
    if (items.length === 0) {
      return (
        <EmptyState
          icon="pi-box"
          title="No selectable items"
          message="This asset has no separately listed items — importing brings in everything."
          variant="compact"
        />
      )
    }

    return (
      <ul className="asset-store-item-list" data-testid="asset-store-item-list">
        {items.map(assetItem => {
          const previewUrl = previewByItemId.get(assetItem.id)
          return (
            <li
              key={assetItem.id}
              className="asset-store-item-row"
              onClick={() => !isImporting && toggle(assetItem.id)}
              data-testid={`asset-store-item-${assetItem.id}`}
            >
              <Checkbox
                checked={selectedSet.has(assetItem.id)}
                disabled={isImporting}
                onChange={() => toggle(assetItem.id)}
              />
              <span className="asset-store-item-media">
                {previewUrl ? (
                  <img src={previewUrl} alt={assetItem.name} loading="lazy" />
                ) : (
                  <i className="pi pi-box" aria-hidden="true" />
                )}
              </span>
              <span className="asset-store-item-name" title={assetItem.name}>
                {assetItem.name}
              </span>
              <span className="asset-store-item-type">
                {itemTypeLabel(assetItem.itemType)}
              </span>
              <span className="asset-store-item-size">
                {formatFileSize(sumItemSize(assetItem, fileSizeById))}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  const importLabel = importedPackId !== null ? 'Re-import' : 'Import'
  const progressText =
    entry?.phase === 'importing' && entry.itemsTotal > 0
      ? `Importing… ${entry.itemsProcessed}/${entry.itemsTotal}`
      : 'Importing…'

  return (
    <div className="asset-store-detail" data-testid="asset-store-detail">
      {header}
      <div className="asset-store-detail-body">{renderBody()}</div>

      <div className="asset-store-detail-footer">
        {items.length > 0 && (
          <label className="asset-store-select-all">
            <Checkbox
              checked={allSelected}
              disabled={isImporting}
              onChange={toggleAll}
              data-testid="asset-store-select-all"
            />
            <span>Select all</span>
          </label>
        )}

        <div className="asset-store-detail-action">
          {isImporting ? (
            <span
              className="asset-store-chip"
              data-testid="asset-store-detail-progress"
            >
              <i className="pi pi-spin pi-spinner" aria-hidden="true" />
              {progressText}
            </span>
          ) : (
            <>
              {entry?.phase === 'failed' && (
                <span
                  className="asset-store-login-error"
                  data-testid="asset-store-detail-error"
                >
                  {entry.error ?? 'Import failed'}
                </span>
              )}
              <Button
                label={
                  items.length > 0
                    ? `${entry?.phase === 'failed' ? 'Retry' : importLabel} selected (${selectedIds.length})`
                    : entry?.phase === 'failed'
                      ? 'Retry'
                      : importLabel
                }
                icon="pi pi-download"
                size="small"
                disabled={items.length > 0 && selectedIds.length === 0}
                onClick={runImport}
                data-testid="asset-store-detail-import"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
