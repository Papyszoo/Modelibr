import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useRef, useState } from 'react'

import { getFilePreviewUrl } from '@/features/models/api/modelApi'
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
import { useContainerTextureSets } from '@/shared/hooks/useContainerTextureSets'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { type TextureSetKind, TextureType } from '@/types'

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
  /**
   * Optional kind scope. When provided, the tab only lists/adds texture sets
   * of that kind — used to split the single "Texture Sets" tab into separate
   * "Global Materials" and "Multi-Model Textures" tabs.
   */
  kind?: TextureSetKind
  /**
   * Lowercase singular label ("texture set", "global material",
   * "multi-model texture"). Used inline in drop-hint, search placeholder,
   * empty-state, etc.
   */
  assetLabel?: string
  /**
   * Title-cased singular label ("Texture Set", "Global Material",
   * "Multi-Model Texture"). Used for Add-card label and dialog header.
   * Provided explicitly because hyphenated/multi-word labels can't be
   * derived from the lowercase form by simple capitalization
   * ("multi-model texture" → "Multi-model texture").
   */
  assetTitle?: string
}

export function ContainerTextureSetsTab({
  adapter,
  showToast,
  refetchContainer,
  onTotalCountChange,
  kind,
  assetLabel = 'texture set',
  assetTitle = 'Texture Set',
}: ContainerTextureSetsTabProps) {
  const contextMenuRef = useRef<ContextMenu>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { openTextureSetDetailsTab } = useTabContext()
  const ts = useContainerTextureSets(adapter, showToast, refetchContainer, kind)
  const label = adapter.label
  const labelLower = label.toLowerCase()

  // ── Toolbar state ────────────────────────────────────────────────────
  const [cardWidth, setCardWidth] = useState(ASSET_CARD_WIDTH.default)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')

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
    return texture ? getFilePreviewUrl(texture.fileId.toString()) : null
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

  // Client-side filter of currently-loaded items
  const filteredTextureSets = localSearch.trim()
    ? ts.textureSets.filter(textureSet =>
        textureSet.name.toLowerCase().includes(localSearch.toLowerCase())
      )
    : ts.textureSets

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
            ts.handleUpload(Array.from(e.target.files))
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
              ariaControls="ts-tab-search-panel"
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
              tooltip={`Upload ${assetLabel} files`}
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
            icon="pi pi-palette"
            count={
              localSearch.trim() ? filteredTextureSets.length : ts.totalCount
            }
            unitLabel={assetLabel}
          />
        </ListToolbarRow>

        <ListToolbarPanel id="ts-tab-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder={`Search ${assetLabel}s…`}
          />
        </ListToolbarPanel>
      </ListToolbar>

      <UploadableGrid
        onFilesDropped={ts.handleUpload}
        isUploading={ts.uploading}
        uploadMessage={`Drop ${assetLabel} files here to create and add to ${labelLower}`}
        className="container-grid-wrapper"
      >
        <div className="container-section">
          <AssetGrid cardWidth={cardWidth}>
            {filteredTextureSets.map(textureSet => {
              const albedoUrl = getAlbedoTextureUrl(textureSet)
              return (
                <AssetTile
                  key={textureSet.id}
                  name={textureSet.name}
                  dataAttributes={{ 'data-texture-set-id': textureSet.id }}
                  media={
                    albedoUrl ? (
                      <img src={albedoUrl} alt={textureSet.name} />
                    ) : (
                      <AssetTilePlaceholder
                        icon="pi pi-image"
                        label="No Preview"
                      />
                    )
                  }
                  onClick={() =>
                    openTextureSetDetailsTab(textureSet.id, textureSet.name)
                  }
                  onContextMenu={e => {
                    e.preventDefault()
                    ts.setSelectedItem(textureSet)
                    contextMenuRef.current?.show(e)
                  }}
                />
              )
            })}
            <AddTile label={`Add ${assetTitle}`} onClick={ts.openAddDialog} />
          </AssetGrid>

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
        header={`Add ${assetTitle}s to ${label}`}
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
              placeholder={`Search ${assetLabel}s...`}
              value={ts.searchQuery}
              onChange={e => ts.setSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="scrollable-grid">
            <AssetGrid cardWidth={160}>
              {ts.filteredAvailable.map(textureSet => {
                const albedoUrl = getAlbedoTextureUrl(textureSet)
                const isSelected = ts.selectedIds.includes(textureSet.id)
                return (
                  <AssetTile
                    key={textureSet.id}
                    name={textureSet.name}
                    dataAttributes={{ 'data-texture-set-id': textureSet.id }}
                    selected={isSelected}
                    checkbox={<Checkbox checked={isSelected} readOnly />}
                    media={
                      albedoUrl ? (
                        <img src={albedoUrl} alt={textureSet.name} />
                      ) : (
                        <AssetTilePlaceholder
                          icon="pi pi-image"
                          label="No Preview"
                        />
                      )
                    }
                    onClick={() => ts.toggleSelection(textureSet.id)}
                  />
                )
              })}
            </AssetGrid>
          </div>
          {ts.filteredAvailable.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No {assetLabel}s available to add</p>
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}
