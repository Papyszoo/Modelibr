import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useRef, useState } from 'react'

import { getFileUrl } from '@/features/models/api/modelApi'
import { UploadableGrid } from '@/shared/components'
import {
  AddTile,
  ASSET_CARD_WIDTH,
  AssetGrid,
  AssetTile,
  AssetTilePlaceholder,
} from '@/shared/components/asset-tile'
import {
  ListToolbar,
  ListToolbarActions,
  ListToolbarButton,
  ListToolbarCount,
  ListToolbarPanel,
  ListToolbarRow,
  ListToolbarSearchInput,
  OptionsButton,
} from '@/shared/components/list-toolbar'
import { useContainerSprites } from '@/shared/hooks/useContainerSprites'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { formatFileSize } from '@/utils/fileUtils'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface ContainerSpritesTabProps {
  adapter: ContainerAdapter
  showToast: ShowToast
  refetchContainer: () => Promise<void>
  onTotalCountChange?: (count: number) => void
}

export function ContainerSpritesTab({
  adapter,
  showToast,
  refetchContainer,
  onTotalCountChange,
}: ContainerSpritesTabProps) {
  const contextMenuRef = useRef<ContextMenu>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sp = useContainerSprites(adapter, showToast, refetchContainer)
  const label = adapter.label
  const labelLower = label.toLowerCase()

  // ── Toolbar state ────────────────────────────────────────────────────
  const [cardWidth, setCardWidth] = useState(ASSET_CARD_WIDTH.default)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')

  useEffect(() => {
    onTotalCountChange?.(sp.totalCount)
  }, [sp.totalCount, onTotalCountChange])

  const handleDownloadSprite = async () => {
    if (!sp.selectedItem) return
    try {
      const url = getFileUrl(sp.selectedItem.fileId.toString())
      const response = await fetch(url)
      const blob = await response.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      const extension = sp.selectedItem.fileName.split('.').pop() || 'png'
      link.download = `${sp.selectedItem.name}.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    } catch (error) {
      console.error('Failed to download sprite:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to download sprite',
        life: 3000,
      })
    }
  }

  const contextMenuItems: MenuItem[] = [
    {
      label: `Remove from ${labelLower}`,
      icon: 'pi pi-times',
      command: () => {
        if (sp.selectedItem) sp.removeMutation.mutate(sp.selectedItem.id)
      },
    },
  ]

  // Client-side filter of currently-loaded items
  const filteredSprites = localSearch.trim()
    ? sp.sprites.filter(s =>
        s.name.toLowerCase().includes(localSearch.toLowerCase())
      )
    : sp.sprites

  return (
    <>
      <ContextMenu model={contextMenuItems} ref={contextMenuRef} />

      {/* Hidden file input for toolbar Upload button */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        accept="image/*"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            sp.handleUpload(Array.from(e.target.files))
            e.target.value = ''
          }
        }}
      />

      <ListToolbar>
        <ListToolbarRow>
          <ListToolbarActions>
            <ListToolbarButton
              icon="pi pi-search"
              label="Search"
              active={isSearchOpen || localSearch.trim().length > 0}
              onClick={() => setIsSearchOpen(open => !open)}
              ariaLabel="Search"
              ariaExpanded={isSearchOpen}
              ariaControls="sp-tab-search-panel"
            />
            <OptionsButton
              cardWidth={cardWidth}
              minCardWidth={ASSET_CARD_WIDTH.min}
              maxCardWidth={ASSET_CARD_WIDTH.max}
              onCardWidthChange={setCardWidth}
              showThumbnailAnimation={false}
            />
            <ListToolbarButton
              icon="pi pi-upload"
              label="Upload"
              onClick={() => fileInputRef.current?.click()}
              tooltip="Upload sprite images"
              ariaLabel="Upload"
            />
            <ListToolbarButton
              icon="pi pi-refresh"
              label="Refresh"
              onClick={() => void refetchContainer()}
              tooltip="Refresh"
              ariaLabel="Refresh"
            />
          </ListToolbarActions>
          <ListToolbarCount
            icon="pi pi-images"
            count={sp.totalCount}
            unitLabel="sprite"
          />
        </ListToolbarRow>

        <ListToolbarPanel id="sp-tab-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="Search sprites…"
          />
        </ListToolbarPanel>
      </ListToolbar>

      <UploadableGrid
        onFilesDropped={sp.handleUpload}
        isUploading={sp.uploading}
        uploadMessage={`Drop image files here to create sprites and add to ${labelLower}`}
        className="container-grid-wrapper"
      >
        <div className="container-section">
          <AssetGrid cardWidth={cardWidth}>
            {filteredSprites.map(sprite => {
              const spriteUrl = getFileUrl(sprite.fileId.toString())
              return (
                <AssetTile
                  key={sprite.id}
                  name={sprite.name}
                  media={
                    spriteUrl ? (
                      <img src={spriteUrl} alt={sprite.name} />
                    ) : (
                      <AssetTilePlaceholder
                        icon="pi pi-image"
                        label="No Preview"
                      />
                    )
                  }
                  onClick={() => sp.openModal(sprite)}
                  onContextMenu={e => {
                    e.preventDefault()
                    sp.setSelectedItem(sprite)
                    contextMenuRef.current?.show(e)
                  }}
                />
              )
            })}
            <AddTile label="Add Sprite" onClick={sp.openAddDialog} />
          </AssetGrid>

          {sp.hasMore && (
            <div className="container-load-more">
              <Button
                label={`Load More (${sp.sprites.length} of ${sp.totalCount})`}
                icon="pi pi-angle-down"
                className="p-button-text"
                onClick={() => sp.fetchNextPage()}
              />
            </div>
          )}
        </div>
      </UploadableGrid>

      {/* Add Sprite Dialog */}
      <Dialog
        header={`Add Sprites to ${label}`}
        visible={sp.showAddDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          sp.setShowAddDialog(false)
          sp.setSelectedIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                sp.setShowAddDialog(false)
                sp.setSelectedIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${sp.selectedIds.length})`}
              icon="pi pi-check"
              onClick={() => sp.addMutation.mutate(sp.selectedIds)}
              disabled={sp.selectedIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search sprites..."
              value={sp.searchQuery}
              onChange={e => sp.setSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="scrollable-grid">
            <AssetGrid cardWidth={160}>
              {sp.filteredAvailable.map(sprite => {
                const spriteUrl = getFileUrl(sprite.fileId.toString())
                const isSelected = sp.selectedIds.includes(sprite.id)
                return (
                  <AssetTile
                    key={sprite.id}
                    name={sprite.name}
                    selected={isSelected}
                    checkbox={<Checkbox checked={isSelected} readOnly />}
                    media={
                      spriteUrl ? (
                        <img src={spriteUrl} alt={sprite.name} />
                      ) : (
                        <AssetTilePlaceholder
                          icon="pi pi-image"
                          label="No Preview"
                        />
                      )
                    }
                    onClick={() => sp.toggleSelection(sprite.id)}
                  />
                )
              })}
            </AssetGrid>
          </div>
          {sp.filteredAvailable.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No sprites available to add</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Sprite Detail Modal */}
      <Dialog
        header={sp.selectedItem?.name || 'Sprite'}
        visible={sp.showModal}
        onHide={() => sp.setShowModal(false)}
        style={{ width: '600px' }}
        className="sprite-detail-modal"
      >
        {sp.selectedItem && (
          <div className="sprite-modal-content">
            <div className="sprite-modal-preview">
              <img
                src={getFileUrl(sp.selectedItem.fileId.toString())}
                alt={sp.selectedItem.name}
              />
            </div>
            <div className="sprite-modal-info">
              <div className="sprite-modal-details">
                <p>
                  <strong>Type:</strong>{' '}
                  {getSpriteTypeName(sp.selectedItem.spriteType)}
                </p>
                <p>
                  <strong>File:</strong> {sp.selectedItem.fileName}
                </p>
                <p>
                  <strong>Size:</strong>{' '}
                  {formatFileSize(sp.selectedItem.fileSizeBytes)}
                </p>
                <p>
                  <strong>Category:</strong>{' '}
                  {sp.selectedItem.categoryName || 'Unassigned'}
                </p>
              </div>
              <div className="sprite-modal-download">
                <Button
                  label="Download"
                  icon="pi pi-download"
                  onClick={handleDownloadSprite}
                  className="p-button-success w-full"
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}

// ── Utility ───────────────────────────────────────────────────────────
function getSpriteTypeName(type: number): string {
  switch (type) {
    case 1:
      return 'Static'
    case 2:
      return 'Sprite Sheet'
    case 3:
      return 'GIF'
    case 4:
      return 'APNG'
    case 5:
      return 'Animated WebP'
    default:
      return 'Unknown'
  }
}
