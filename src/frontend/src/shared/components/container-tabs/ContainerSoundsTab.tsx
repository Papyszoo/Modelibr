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
import { useContainerSounds } from '@/shared/hooks/useContainerSounds'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { formatDuration } from '@/utils/audioUtils'
import { formatFileSize } from '@/utils/fileUtils'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface ContainerSoundsTabProps {
  adapter: ContainerAdapter
  showToast: ShowToast
  refetchContainer: () => Promise<void>
  onTotalCountChange?: (count: number) => void
}

export function ContainerSoundsTab({
  adapter,
  showToast,
  refetchContainer,
  onTotalCountChange,
}: ContainerSoundsTabProps) {
  const contextMenuRef = useRef<ContextMenu>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sn = useContainerSounds(adapter, showToast, refetchContainer)
  const label = adapter.label
  const labelLower = label.toLowerCase()

  // ── Toolbar state ────────────────────────────────────────────────────
  const [cardWidth, setCardWidth] = useState(ASSET_CARD_WIDTH.default)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')

  useEffect(() => {
    onTotalCountChange?.(sn.totalCount)
  }, [sn.totalCount, onTotalCountChange])

  const contextMenuItems: MenuItem[] = [
    {
      label: `Remove from ${labelLower}`,
      icon: 'pi pi-times',
      command: () => {
        if (sn.selectedItem) sn.removeMutation.mutate(sn.selectedItem.id)
      },
    },
  ]

  // Client-side filter of currently-loaded items
  const filteredSounds = localSearch.trim()
    ? sn.sounds.filter(s =>
        s.name.toLowerCase().includes(localSearch.toLowerCase())
      )
    : sn.sounds

  return (
    <>
      <ContextMenu model={contextMenuItems} ref={contextMenuRef} />

      {/* Hidden file input for toolbar Upload button */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        accept="audio/*"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            sn.handleUpload(Array.from(e.target.files))
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
              ariaControls="sn-tab-search-panel"
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
              tooltip="Upload audio files"
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
            icon="pi pi-volume-up"
            count={localSearch.trim() ? filteredSounds.length : sn.totalCount}
            unitLabel="sound"
          />
        </ListToolbarRow>

        <ListToolbarPanel id="sn-tab-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="Search sounds…"
          />
        </ListToolbarPanel>
      </ListToolbar>

      <UploadableGrid
        onFilesDropped={sn.handleUpload}
        isUploading={sn.uploading}
        uploadMessage={`Drop audio files here to create sounds and add to ${labelLower}`}
        className="container-grid-wrapper"
      >
        <div className="container-section">
          <AssetGrid cardWidth={cardWidth}>
            {filteredSounds.map(sound => (
              <AssetTile
                key={sound.id}
                name={sound.name}
                meta={formatDuration(sound.duration)}
                media={<AssetTilePlaceholder icon="pi pi-volume-up" />}
                onClick={() => sn.openModal(sound)}
                onContextMenu={e => {
                  e.preventDefault()
                  sn.setSelectedItem(sound)
                  contextMenuRef.current?.show(e)
                }}
              />
            ))}
            <AddTile label="Add Sound" onClick={sn.openAddDialog} />
          </AssetGrid>

          {sn.hasMore && (
            <div className="container-load-more">
              <Button
                label={`Load More (${sn.sounds.length} of ${sn.totalCount})`}
                icon="pi pi-angle-down"
                className="p-button-text"
                onClick={() => sn.fetchNextPage()}
              />
            </div>
          )}
        </div>
      </UploadableGrid>

      {/* Add Sound Dialog */}
      <Dialog
        header={`Add Sounds to ${label}`}
        visible={sn.showAddDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          sn.setShowAddDialog(false)
          sn.setSelectedIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                sn.setShowAddDialog(false)
                sn.setSelectedIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${sn.selectedIds.length})`}
              icon="pi pi-check"
              onClick={() => sn.addMutation.mutate(sn.selectedIds)}
              disabled={sn.selectedIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search sounds..."
              value={sn.searchQuery}
              onChange={e => sn.setSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="scrollable-grid">
            <AssetGrid cardWidth={160}>
              {sn.filteredAvailable.map(sound => {
                const isSelected = sn.selectedIds.includes(sound.id)
                return (
                  <AssetTile
                    key={sound.id}
                    name={sound.name}
                    meta={formatDuration(sound.duration)}
                    selected={isSelected}
                    checkbox={<Checkbox checked={isSelected} readOnly />}
                    media={<AssetTilePlaceholder icon="pi pi-volume-up" />}
                    onClick={() => {
                      sn.setSelectedIds(prev =>
                        prev.includes(sound.id)
                          ? prev.filter(id => id !== sound.id)
                          : [...prev, sound.id]
                      )
                    }}
                  />
                )
              })}
            </AssetGrid>
          </div>
          {sn.filteredAvailable.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No sounds available to add</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Sound Detail Modal */}
      <Dialog
        header={sn.selectedItem?.name || 'Sound'}
        visible={sn.showModal}
        onHide={() => sn.setShowModal(false)}
        style={{ width: '600px' }}
        className="sound-detail-modal"
      >
        {sn.selectedItem && (
          <div className="sound-modal-content">
            <div className="sound-modal-preview">
              <audio
                controls
                src={getFileUrl(sn.selectedItem.fileId.toString())}
                style={{ width: '100%' }}
              />
            </div>
            <div className="sound-modal-info">
              <div className="sound-modal-details">
                <p>
                  <strong>Duration:</strong>{' '}
                  {formatDuration(sn.selectedItem.duration)}
                </p>
                <p>
                  <strong>File:</strong> {sn.selectedItem.fileName}
                </p>
                <p>
                  <strong>Size:</strong>{' '}
                  {formatFileSize(sn.selectedItem.fileSizeBytes)}
                </p>
                <p>
                  <strong>Category:</strong>{' '}
                  {sn.selectedItem.categoryName || 'Unassigned'}
                </p>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}
