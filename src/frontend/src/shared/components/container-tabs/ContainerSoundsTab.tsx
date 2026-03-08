import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useRef } from 'react'

import { getFileUrl } from '@/features/models/api/modelApi'
import { UploadableGrid } from '@/shared/components'
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
  const sn = useContainerSounds(adapter, showToast, refetchContainer)
  const label = adapter.label
  const labelLower = label.toLowerCase()

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

  return (
    <>
      <ContextMenu model={contextMenuItems} ref={contextMenuRef} />
      <UploadableGrid
        onFilesDropped={sn.handleUpload}
        isUploading={sn.uploading}
        uploadMessage={`Drop audio files here to create sounds and add to ${labelLower}`}
        className="container-grid-wrapper"
      >
        <div className="container-section">
          <div className="container-grid">
            {sn.sounds.map(sound => (
              <div
                key={sound.id}
                className="container-card"
                onClick={() => sn.openModal(sound)}
                onContextMenu={e => {
                  e.preventDefault()
                  sn.setSelectedItem(sound)
                  contextMenuRef.current?.show(e)
                }}
              >
                <div className="container-card-thumbnail">
                  <div className="container-card-placeholder">
                    <i className="pi pi-volume-up" />
                    <span>{formatDuration(sound.duration)}</span>
                  </div>
                  <div className="container-card-overlay">
                    <span className="container-card-name">{sound.name}</span>
                  </div>
                </div>
              </div>
            ))}
            <div
              className="container-card container-card-add"
              onClick={sn.openAddDialog}
            >
              <div className="container-card-add-content">
                <i className="pi pi-plus" />
                <span>Add Sound</span>
              </div>
            </div>
          </div>
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
          <div className="container-grid scrollable-grid">
            {sn.filteredAvailable.map(sound => {
              const isSelected = sn.selectedIds.includes(sound.id)
              return (
                <div
                  key={sound.id}
                  className={`container-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    sn.setSelectedIds(prev =>
                      prev.includes(sound.id)
                        ? prev.filter(id => id !== sound.id)
                        : [...prev, sound.id]
                    )
                  }}
                >
                  <div className="container-card-checkbox">
                    <Checkbox checked={isSelected} readOnly />
                  </div>
                  <div className="container-card-thumbnail">
                    <div className="container-card-placeholder">
                      <i className="pi pi-volume-up" />
                      <span>{formatDuration(sound.duration)}</span>
                    </div>
                    <div className="container-card-overlay">
                      <span className="container-card-name">{sound.name}</span>
                    </div>
                  </div>
                </div>
              )
            })}
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
