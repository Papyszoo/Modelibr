import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useRef, useState } from 'react'

import { getEnvironmentMapPrimaryPreviewUrl } from '@/features/environment-map/utils/environmentMapUtils'
import { useTabContext } from '@/hooks/useTabContext'
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { openEnvironmentMapDetailsTab } = useTabContext()
  const env = useContainerEnvironmentMaps(adapter, showToast, refetchContainer)
  const label = adapter.label
  const labelLower = label.toLowerCase()

  // ── Toolbar state ────────────────────────────────────────────────────
  const [cardWidth, setCardWidth] = useState(ASSET_CARD_WIDTH.default)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')

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

  // Client-side filter of currently-loaded items
  const filteredEnvironmentMaps = localSearch.trim()
    ? env.environmentMaps.filter(em =>
        em.name.toLowerCase().includes(localSearch.toLowerCase())
      )
    : env.environmentMaps

  return (
    <>
      <ContextMenu model={contextMenuItems} ref={contextMenuRef} />

      {/* Hidden file input for toolbar Upload button */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            env.handleUpload(Array.from(e.target.files))
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
              ariaControls="env-tab-search-panel"
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
              tooltip="Upload panoramic images"
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
            icon="pi pi-globe"
            count={env.totalCount}
            unitLabel="environment map"
          />
        </ListToolbarRow>

        <ListToolbarPanel id="env-tab-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="Search environment maps…"
          />
        </ListToolbarPanel>
      </ListToolbar>

      <UploadableGrid
        onFilesDropped={env.handleUpload}
        isUploading={env.uploading}
        uploadMessage={`Drop panoramic images here to create environment maps and add to ${labelLower}`}
        className="container-grid-wrapper"
      >
        <div className="container-section">
          {/* variant='wide' — env maps are panoramic so 2:1 aspect with object-fit: contain */}
          <AssetGrid cardWidth={cardWidth}>
            {filteredEnvironmentMaps.map(environmentMap => {
              const previewUrl =
                getEnvironmentMapPrimaryPreviewUrl(environmentMap)
              return (
                <AssetTile
                  key={environmentMap.id}
                  name={environmentMap.name}
                  meta={`${environmentMap.variantCount} variant${environmentMap.variantCount === 1 ? '' : 's'}`}
                  variant="wide"
                  media={
                    previewUrl ? (
                      <img src={previewUrl} alt={environmentMap.name} />
                    ) : (
                      <AssetTilePlaceholder
                        icon="pi pi-globe"
                        label="No Preview"
                      />
                    )
                  }
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
                />
              )
            })}

            {/* AddTile is always square — not affected by variant='wide' on peers */}
            <AddTile label="Add Environment Map" onClick={env.openAddDialog} />
          </AssetGrid>

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
      </UploadableGrid>

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

          <div className="scrollable-grid">
            <AssetGrid cardWidth={280}>
              {env.filteredAvailable.map(environmentMap => {
                const previewUrl =
                  getEnvironmentMapPrimaryPreviewUrl(environmentMap)
                const isSelected = env.selectedIds.includes(environmentMap.id)
                return (
                  <AssetTile
                    key={environmentMap.id}
                    name={environmentMap.name}
                    meta={`${environmentMap.variantCount} variant${environmentMap.variantCount === 1 ? '' : 's'}`}
                    variant="wide"
                    selected={isSelected}
                    checkbox={<Checkbox checked={isSelected} readOnly />}
                    media={
                      previewUrl ? (
                        <img src={previewUrl} alt={environmentMap.name} />
                      ) : (
                        <AssetTilePlaceholder
                          icon="pi pi-globe"
                          label="No Preview"
                        />
                      )
                    }
                    onClick={() => env.toggleSelection(environmentMap.id)}
                  />
                )
              })}
            </AssetGrid>
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
