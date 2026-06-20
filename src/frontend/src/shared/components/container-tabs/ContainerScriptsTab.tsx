import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useRef, useState } from 'react'

import { ScriptEditor } from '@/features/scripts'
import { getLanguageLabel } from '@/features/scripts/utils/languages'
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
import { useContainerScripts } from '@/shared/hooks/useContainerScripts'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface ContainerScriptsTabProps {
  adapter: ContainerAdapter
  showToast: ShowToast
  refetchContainer: () => Promise<void>
  onTotalCountChange?: (count: number) => void
}

// Source-code file extensions accepted by the upload input.
const SCRIPT_ACCEPT =
  '.js,.jsx,.mjs,.cjs,.ts,.tsx,.py,.cs,.cpp,.cc,.cxx,.c,.h,.hpp,.lua,.java,.go,.rs,.rb,.php,.sh,.sql,.json,.yaml,.yml,.xml,.glsl,.vert,.frag,.hlsl,.shader,.gd'

export function ContainerScriptsTab({
  adapter,
  showToast,
  refetchContainer,
  onTotalCountChange,
}: ContainerScriptsTabProps) {
  const contextMenuRef = useRef<ContextMenu>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sc = useContainerScripts(adapter, showToast, refetchContainer)
  const label = adapter.label
  const labelLower = label.toLowerCase()

  const [cardWidth, setCardWidth] = useState(ASSET_CARD_WIDTH.default)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')

  useEffect(() => {
    onTotalCountChange?.(sc.totalCount)
  }, [sc.totalCount, onTotalCountChange])

  const contextMenuItems: MenuItem[] = [
    {
      label: `Remove from ${labelLower}`,
      icon: 'pi pi-times',
      command: () => {
        if (sc.selectedItem) sc.removeMutation.mutate(sc.selectedItem.id)
      },
    },
  ]

  const filteredScripts = localSearch.trim()
    ? sc.scripts.filter(s =>
        s.name.toLowerCase().includes(localSearch.toLowerCase())
      )
    : sc.scripts

  return (
    <>
      <ContextMenu model={contextMenuItems} ref={contextMenuRef} />

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        accept={SCRIPT_ACCEPT}
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            sc.handleUpload(Array.from(e.target.files))
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
              ariaControls="sc-tab-search-panel"
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
              tooltip="Upload source-code files"
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
            icon="pi pi-code"
            count={localSearch.trim() ? filteredScripts.length : sc.totalCount}
            unitLabel="script"
          />
        </ListToolbarRow>

        <ListToolbarPanel id="sc-tab-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="Search scripts…"
          />
        </ListToolbarPanel>
      </ListToolbar>

      <UploadableGrid
        onFilesDropped={sc.handleUpload}
        isUploading={sc.uploading}
        uploadMessage={`Drop source-code files here to create scripts and add to ${labelLower}`}
        className="container-grid-wrapper"
      >
        <div className="container-section">
          <AssetGrid cardWidth={cardWidth}>
            {filteredScripts.map(script => (
              <AssetTile
                key={script.id}
                name={script.name}
                meta={getLanguageLabel(script.language)}
                media={<AssetTilePlaceholder icon="pi pi-code" />}
                onClick={() => sc.openModal(script)}
                onContextMenu={e => {
                  e.preventDefault()
                  sc.setSelectedItem(script)
                  contextMenuRef.current?.show(e)
                }}
              />
            ))}
            <AddTile label="Add Script" onClick={sc.openAddDialog} />
          </AssetGrid>

          {sc.hasMore && (
            <div className="container-load-more">
              <Button
                label={`Load More (${sc.scripts.length} of ${sc.totalCount})`}
                icon="pi pi-angle-down"
                className="p-button-text"
                onClick={() => sc.fetchNextPage()}
              />
            </div>
          )}
        </div>
      </UploadableGrid>

      {/* Add Script Dialog */}
      <Dialog
        header={`Add Scripts to ${label}`}
        visible={sc.showAddDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          sc.setShowAddDialog(false)
          sc.setSelectedIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                sc.setShowAddDialog(false)
                sc.setSelectedIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${sc.selectedIds.length})`}
              icon="pi pi-check"
              onClick={() => sc.addMutation.mutate(sc.selectedIds)}
              disabled={sc.selectedIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search scripts..."
              value={sc.searchQuery}
              onChange={e => sc.setSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="scrollable-grid">
            <AssetGrid cardWidth={160}>
              {sc.filteredAvailable.map(script => {
                const isSelected = sc.selectedIds.includes(script.id)
                return (
                  <AssetTile
                    key={script.id}
                    name={script.name}
                    meta={getLanguageLabel(script.language)}
                    selected={isSelected}
                    checkbox={<Checkbox checked={isSelected} readOnly />}
                    media={<AssetTilePlaceholder icon="pi pi-code" />}
                    onClick={() => {
                      sc.setSelectedIds(prev =>
                        prev.includes(script.id)
                          ? prev.filter(id => id !== script.id)
                          : [...prev, script.id]
                      )
                    }}
                  />
                )
              })}
            </AssetGrid>
          </div>
          {sc.filteredAvailable.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No scripts available to add</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Script Editor Modal */}
      <Dialog
        visible={sc.showModal}
        onHide={() => sc.setShowModal(false)}
        style={{ width: '900px' }}
        header={null}
        closable={false}
        contentStyle={{ padding: 0 }}
      >
        {sc.selectedItem && (
          <ScriptEditor
            script={sc.selectedItem}
            onClose={() => sc.setShowModal(false)}
            onScriptUpdated={() => refetchContainer()}
          />
        )}
      </Dialog>
    </>
  )
}
