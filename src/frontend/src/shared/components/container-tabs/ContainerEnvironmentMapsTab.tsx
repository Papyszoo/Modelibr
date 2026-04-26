import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useRef } from 'react'

import { getEnvironmentMapPrimaryPreviewUrl } from '@/features/environment-map/utils/environmentMapUtils'
import { useTabContext } from '@/hooks/useTabContext'
import { UploadDropZone } from '@/shared/components/UploadDropZone'
import { useContainerEnvironmentMaps } from '@/shared/hooks/useContainerEnvironmentMaps'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface ContainerEnvironmentMapsTabProps {
  adapter: ContainerAdapter
  showToast: ShowToast
  refetchContainer: () => Promise<void>
  onTotalCountChange?: (count: number) => void
}

export function ContainerEnvironmentMapsTab({
  adapter,
  showToast,
  refetchContainer,
  onTotalCountChange,
}: ContainerEnvironmentMapsTabProps) {
  const contextMenuRef = useRef<ContextMenu>(null)
  const { openEnvironmentMapDetailsTab } = useTabContext()
  const env = useContainerEnvironmentMaps(adapter, showToast, refetchContainer)
  const label = adapter.label
  const labelLower = label.toLowerCase()

  useEffect(() => {
    onTotalCountChange?.(env.totalCount)
  }, [env.totalCount, onTotalCountChange])

  const contextMenuItems: MenuItem[] = [
    {
      label: `Remove from ${labelLower}`,
      icon: 'pi pi-times',
      command: () => {
        if (env.selectedItem) {
          env.removeMutation.mutate(env.selectedItem.id)
        }
      },
    },
  ]

  return (
    <>
      <ContextMenu model={contextMenuItems} ref={contextMenuRef} />

      <UploadDropZone
        onFilesDropped={env.handleUpload}
        className="container-grid-wrapper"
      >
        <div className="container-section">
          <div className="container-grid">
            {env.environmentMaps.map(environmentMap => {
              const previewUrl =
                getEnvironmentMapPrimaryPreviewUrl(environmentMap)

              return (
                <div
                  key={environmentMap.id}
                  className="container-card environment-map-container-card"
                  onClick={() =>
                    openEnvironmentMapDetailsTab(
                      environmentMap.id,
                      environmentMap.name
                    )
                  }
                  onContextMenu={event => {
                    event.preventDefault()
                    env.setSelectedItem(environmentMap)
                    contextMenuRef.current?.show(event)
                  }}
                >
                  <div className="container-card-thumbnail">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={environmentMap.name}
                        className="container-card-image"
                      />
                    ) : (
                      <div className="container-card-placeholder">
                        <i className="pi pi-globe" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="container-card-overlay">
                      <span className="container-card-name">
                        {environmentMap.name}
                      </span>
                      <span>
                        {environmentMap.variantCount} variant
                        {environmentMap.variantCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}

            <div
              className="container-card container-card-add environment-map-container-card"
              onClick={env.openAddDialog}
            >
              <div className="container-card-add-content">
                <i className="pi pi-plus" />
                <span>Add Environment Map</span>
              </div>
            </div>
          </div>

          {env.hasMore ? (
            <div className="container-load-more">
              <Button
                label={`Load More (${env.environmentMaps.length} of ${env.totalCount})`}
                icon="pi pi-angle-down"
                className="p-button-text"
                onClick={() => env.fetchNextPage()}
              />
            </div>
          ) : null}
        </div>
      </UploadDropZone>

      <Dialog
        header={`Add Environment Maps to ${label}`}
        visible={env.showAddDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          env.setShowAddDialog(false)
          env.setSelectedIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              className="p-button-text"
              onClick={() => {
                env.setShowAddDialog(false)
                env.setSelectedIds([])
              }}
            />
            <Button
              label={`Add Selected (${env.selectedIds.length})`}
              icon="pi pi-check"
              onClick={() => env.addMutation.mutate(env.selectedIds)}
              disabled={env.selectedIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search environment maps..."
              value={env.searchQuery}
              onChange={event => env.setSearchQuery(event.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>

          <div className="container-grid scrollable-grid">
            {env.filteredAvailable.map(environmentMap => {
              const previewUrl =
                getEnvironmentMapPrimaryPreviewUrl(environmentMap)
              const isSelected = env.selectedIds.includes(environmentMap.id)

              return (
                <div
                  key={environmentMap.id}
                  className={`container-card environment-map-container-card ${
                    isSelected ? 'selected' : ''
                  }`}
                  onClick={() => env.toggleSelection(environmentMap.id)}
                >
                  <div className="container-card-checkbox">
                    <Checkbox checked={isSelected} readOnly />
                  </div>
                  <div className="container-card-thumbnail">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={environmentMap.name}
                        className="container-card-image"
                      />
                    ) : (
                      <div className="container-card-placeholder">
                        <i className="pi pi-globe" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="container-card-overlay">
                      <span className="container-card-name">
                        {environmentMap.name}
                      </span>
                      <span>
                        {environmentMap.variantCount} variant
                        {environmentMap.variantCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {env.filteredAvailable.length === 0 ? (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No environment maps available to add</p>
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
