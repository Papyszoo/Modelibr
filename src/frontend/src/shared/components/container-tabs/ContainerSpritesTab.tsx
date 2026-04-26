import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useRef } from 'react'

import { getFileUrl } from '@/features/models/api/modelApi'
import { UploadDropZone } from '@/shared/components/UploadDropZone'
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
  const sp = useContainerSprites(adapter, showToast, refetchContainer)
  const label = adapter.label
  const labelLower = label.toLowerCase()

  useEffect(() => {
    onTotalCountChange?.(sp.totalCount)
  }, [sp.totalCount, onTotalCountChange])

  const getSpriteTypeName = (type: number): string => {
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

  return (
    <>
      <ContextMenu model={contextMenuItems} ref={contextMenuRef} />
      <UploadDropZone
        onFilesDropped={sp.handleUpload}
        className="container-grid-wrapper"
      >
        <div className="container-section">
          <div className="container-grid">
            {sp.sprites.map(sprite => {
              const spriteUrl = getFileUrl(sprite.fileId.toString())
              return (
                <div
                  key={sprite.id}
                  className="container-card"
                  onClick={() => sp.openModal(sprite)}
                  onContextMenu={e => {
                    e.preventDefault()
                    sp.setSelectedItem(sprite)
                    contextMenuRef.current?.show(e)
                  }}
                >
                  <div className="container-card-thumbnail">
                    {spriteUrl ? (
                      <img
                        src={spriteUrl}
                        alt={sprite.name}
                        className="container-card-image"
                      />
                    ) : (
                      <div className="container-card-placeholder">
                        <i className="pi pi-image" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="container-card-overlay">
                      <span className="container-card-name">{sprite.name}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            <div
              className="container-card container-card-add"
              onClick={sp.openAddDialog}
            >
              <div className="container-card-add-content">
                <i className="pi pi-plus" />
                <span>Add Sprite</span>
              </div>
            </div>
          </div>
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
      </UploadDropZone>

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
          <div className="container-grid scrollable-grid">
            {sp.filteredAvailable.map(sprite => {
              const spriteUrl = getFileUrl(sprite.fileId.toString())
              const isSelected = sp.selectedIds.includes(sprite.id)
              return (
                <div
                  key={sprite.id}
                  className={`container-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => sp.toggleSelection(sprite.id)}
                >
                  <div className="container-card-checkbox">
                    <Checkbox checked={isSelected} readOnly />
                  </div>
                  <div className="container-card-thumbnail">
                    {spriteUrl ? (
                      <img
                        src={spriteUrl}
                        alt={sprite.name}
                        className="container-card-image"
                      />
                    ) : (
                      <div className="container-card-placeholder">
                        <i className="pi pi-image" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="container-card-overlay">
                      <span className="container-card-name">{sprite.name}</span>
                    </div>
                  </div>
                </div>
              )
            })}
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
