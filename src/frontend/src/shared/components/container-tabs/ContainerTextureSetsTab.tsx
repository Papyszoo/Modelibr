import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useRef } from 'react'

import { getFileUrl } from '@/features/models/api/modelApi'
import { useTabContext } from '@/hooks/useTabContext'
import { UploadableGrid } from '@/shared/components'
import { useContainerTextureSets } from '@/shared/hooks/useContainerTextureSets'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { TextureType } from '@/types'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface ContainerTextureSetsTabProps {
  adapter: ContainerAdapter
  showToast: ShowToast
  refetchContainer: () => Promise<void>
  onTotalCountChange?: (count: number) => void
}

export function ContainerTextureSetsTab({
  adapter,
  showToast,
  refetchContainer,
  onTotalCountChange,
}: ContainerTextureSetsTabProps) {
  const contextMenuRef = useRef<ContextMenu>(null)
  const { openTextureSetDetailsTab } = useTabContext()
  const ts = useContainerTextureSets(adapter, showToast, refetchContainer)
  const label = adapter.label
  const labelLower = label.toLowerCase()

  useEffect(() => {
    onTotalCountChange?.(ts.totalCount)
  }, [ts.totalCount, onTotalCountChange])

  const getAlbedoTextureUrl = (textureSet: {
    textures?: { textureType: number; fileId: number }[]
  }) => {
    const albedo = textureSet.textures?.find(
      t => t.textureType === TextureType.Albedo
    )
    const diffuseType = (TextureType as unknown as Record<string, number>)
      .Diffuse
    const diffuse =
      typeof diffuseType === 'number'
        ? textureSet.textures?.find(t => t.textureType === diffuseType)
        : undefined
    const texture = albedo || diffuse
    return texture ? getFileUrl(texture.fileId.toString()) : null
  }

  const contextMenuItems: MenuItem[] = [
    {
      label: `Remove from ${labelLower}`,
      icon: 'pi pi-times',
      command: () => {
        if (ts.selectedItem) ts.removeMutation.mutate(ts.selectedItem.id)
      },
    },
  ]

  return (
    <>
      <ContextMenu model={contextMenuItems} ref={contextMenuRef} />
      <UploadableGrid
        onFilesDropped={ts.handleUpload}
        isUploading={ts.uploading}
        uploadMessage={`Drop texture files here to create and add to ${labelLower}`}
        className="container-grid-wrapper"
      >
        <div className="container-section">
          <div className="container-grid">
            {ts.textureSets.map(textureSet => {
              const albedoUrl = getAlbedoTextureUrl(textureSet)
              return (
                <div
                  key={textureSet.id}
                  className="container-card"
                  onClick={() =>
                    openTextureSetDetailsTab(textureSet.id, textureSet.name)
                  }
                  onContextMenu={e => {
                    e.preventDefault()
                    ts.setSelectedItem(textureSet)
                    contextMenuRef.current?.show(e)
                  }}
                >
                  <div className="container-card-thumbnail">
                    {albedoUrl ? (
                      <img
                        src={albedoUrl}
                        alt={textureSet.name}
                        className="container-card-image"
                      />
                    ) : (
                      <div className="container-card-placeholder">
                        <i className="pi pi-image" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="container-card-overlay">
                      <span className="container-card-name">
                        {textureSet.name}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            <div
              className="container-card container-card-add"
              onClick={ts.openAddDialog}
            >
              <div className="container-card-add-content">
                <i className="pi pi-plus" />
                <span>Add Texture Set</span>
              </div>
            </div>
          </div>
          {ts.hasMore && (
            <div className="container-load-more">
              <Button
                label={`Load More (${ts.textureSets.length} of ${ts.totalCount})`}
                icon="pi pi-angle-down"
                className="p-button-text"
                onClick={() => ts.fetchNextPage()}
              />
            </div>
          )}
        </div>
      </UploadableGrid>

      <Dialog
        header={`Add Texture Sets to ${label}`}
        visible={ts.showAddDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          ts.setShowAddDialog(false)
          ts.setSelectedIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                ts.setShowAddDialog(false)
                ts.setSelectedIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${ts.selectedIds.length})`}
              icon="pi pi-check"
              onClick={() => ts.addMutation.mutate(ts.selectedIds)}
              disabled={ts.selectedIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search texture sets..."
              value={ts.searchQuery}
              onChange={e => ts.setSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="container-grid scrollable-grid">
            {ts.filteredAvailable.map(textureSet => {
              const albedoUrl = getAlbedoTextureUrl(textureSet)
              const isSelected = ts.selectedIds.includes(textureSet.id)
              return (
                <div
                  key={textureSet.id}
                  className={`container-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => ts.toggleSelection(textureSet.id)}
                >
                  <div className="container-card-checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => ts.toggleSelection(textureSet.id)}
                    />
                  </div>
                  <div className="container-card-thumbnail">
                    {albedoUrl ? (
                      <img
                        src={albedoUrl}
                        alt={textureSet.name}
                        className="container-card-image"
                      />
                    ) : (
                      <div className="container-card-placeholder">
                        <i className="pi pi-image" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="container-card-overlay">
                      <span className="container-card-name">
                        {textureSet.name}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {ts.filteredAvailable.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No texture sets available to add</p>
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}
