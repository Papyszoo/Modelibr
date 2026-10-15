import './PackList.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { ContextMenu } from 'primereact/contextmenu'
import { Dropdown } from 'primereact/dropdown'
import { type MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import { useCallback, useMemo, useRef, useState } from 'react'

import { deletePack } from '@/features/pack/api/packApi'
import { usePacksQuery } from '@/features/pack/api/queries'
import { useTabContext } from '@/hooks/useTabContext'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import { EmptyState, LoadingState } from '@/shared/components/feedback'
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
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { type PackDto } from '@/types'

import { CreatePackDialog } from './CreatePackDialog'

export function PackList() {
  const queryClient = useQueryClient()
  const packsQuery = usePacksQuery()
  const packs = packsQuery.data ?? []
  const loading = packsQuery.isLoading
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLicense, setSelectedLicense] = useState<string | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [contextPack, setContextPack] = useState<PackDto | null>(null)
  const toast = useRef<Toast>(null)
  const contextMenu = useRef<ContextMenu>(null)
  const { openPackDetailsTab } = useTabContext()

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.packs

  const invalidatePacks = async () => {
    await queryClient.invalidateQueries({ queryKey: ['packs'] })
  }

  const deletePackMutation = useMutation({
    mutationFn: (packId: number) => deletePack(packId),
    onMutate: async packId => {
      await queryClient.cancelQueries({ queryKey: ['packs'] })
      const previousPacks = queryClient.getQueryData<PackDto[]>(['packs'])
      queryClient.setQueryData<PackDto[]>(['packs'], current =>
        (current ?? []).filter(p => p.id !== packId)
      )
      return { previousPacks }
    },
    onError: (error, _packId, context) => {
      console.error('Failed to delete pack:', error)
      if (context?.previousPacks) {
        queryClient.setQueryData(['packs'], context.previousPacks)
      }
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete pack',
        life: 3000,
      })
    },
    onSuccess: () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Pack deleted successfully',
        life: 3000,
      })
    },
    onSettled: async () => {
      await invalidatePacks()
    },
  })

  const handleDeletePack = async (packId: number) => {
    await deletePackMutation.mutateAsync(packId)
  }

  // A pack is a hard delete (no recycle bin), so it keeps a confirm dialog -
  // opened from the card menu, never straight from a right-click.
  const confirmDeletePack = useCallback(
    (pack: PackDto): void => {
      confirmDialog({
        message: (
          <>
            <p>
              Delete <strong>{pack.name}</strong>? The pack container will be
              removed.
            </p>
            <p>Assets in the pack will remain in your library.</p>
          </>
        ),
        header: `Delete ${pack.name}`,
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Delete Pack',
        rejectLabel: 'Cancel',
        acceptClassName: 'p-button-danger',
        accept: () => {
          void handleDeletePack(pack.id)
        },
      })
    },
    // `handleDeletePack` is recreated with the mutation; the dialog only reads it
    // when its accept button is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletePackMutation]
  )

  const openPackMenu = (event: React.MouseEvent, pack: PackDto): void => {
    event.preventDefault()
    setContextPack(pack)
    contextMenu.current?.show(event)
  }

  const contextMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        label: 'Open',
        icon: 'pi pi-external-link',
        command: () => {
          if (contextPack) {
            openPackDetailsTab(contextPack.id.toString())
          }
        },
      },
      { separator: true },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        command: () => {
          if (contextPack) {
            confirmDeletePack(contextPack)
          }
        },
      },
    ],
    [contextPack, openPackDetailsTab, confirmDeletePack]
  )

  const licenseOptions = Array.from(
    new Set(packs.map(pack => pack.licenseType).filter(Boolean))
  ).map(license => ({ label: license, value: license }))

  const filteredPacks = packs.filter(pack => {
    const matchesSearch =
      searchQuery.trim().length === 0 ||
      pack.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pack.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())

    const matchesLicense =
      !selectedLicense || pack.licenseType === selectedLicense
    return matchesSearch && matchesLicense
  })

  return (
    <div className="pack-list">
      <Toast ref={toast} />

      <ListToolbar>
        <ListToolbarRow>
          <ListToolbarActions>
            <ListToolbarButton
              icon="pi pi-search"
              label="Search"
              active={isSearchOpen || searchQuery.trim().length > 0}
              onClick={() => setIsSearchOpen(open => !open)}
              ariaLabel="Search"
              ariaExpanded={isSearchOpen}
              ariaControls="pack-list-search-panel"
            />
            <ListToolbarButton
              icon="pi pi-sliders-h"
              label="Filters"
              active={isFiltersOpen || selectedLicense !== null}
              onClick={() => setIsFiltersOpen(open => !open)}
              ariaLabel="Filters"
              ariaExpanded={isFiltersOpen}
              ariaControls="pack-list-filters-panel"
              badge={selectedLicense !== null ? 1 : undefined}
            />
            <OptionsButton
              cardWidth={cardWidth}
              minCardWidth={200}
              maxCardWidth={500}
              onCardWidthChange={width => setCardWidth('packs', width)}
              showThumbnailAnimation={false}
            />
            <ListToolbarButton
              icon="pi pi-plus"
              label="Create Pack"
              onClick={() => setShowCreateDialog(true)}
              ariaLabel="Create Pack"
            />
          </ListToolbarActions>

          <ListToolbarCount
            icon="pi pi-box"
            count={filteredPacks.length}
            unitLabel="pack"
          />
        </ListToolbarRow>

        <ListToolbarPanel id="pack-list-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search packs..."
            autoFocus={isSearchOpen}
          />
        </ListToolbarPanel>

        <ListToolbarPanel id="pack-list-filters-panel" open={isFiltersOpen}>
          <div className="list-filters-row">
            <Dropdown
              value={selectedLicense}
              options={licenseOptions}
              onChange={e => setSelectedLicense(e.value ?? null)}
              placeholder="License"
              showClear
              className="list-filters-control"
            />
            {selectedLicense !== null ? (
              <Button
                icon="pi pi-times"
                className="p-button-text p-button-sm list-filters-clear"
                aria-label="Clear all filters"
                tooltip="Clear all filters"
                tooltipOptions={{ position: 'bottom' }}
                onClick={() => setSelectedLicense(null)}
              />
            ) : null}
          </div>
        </ListToolbarPanel>
      </ListToolbar>

      {loading ? (
        <LoadingState message="Loading packs…" />
      ) : filteredPacks.length === 0 ? (
        <EmptyState
          icon="pi-box"
          title="No matching packs"
          message="Adjust the filters or create a new pack."
          action={
            <Button
              label="Create Pack"
              icon="pi pi-plus"
              onClick={() => setShowCreateDialog(true)}
            />
          }
        />
      ) : (
        <div
          className="pack-grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
          }}
        >
          {filteredPacks.map(pack => {
            const thumbnail = resolveApiAssetUrl(pack.customThumbnailUrl)
            return (
              <div
                key={pack.id}
                className="pack-grid-card"
                data-pack-id={pack.id}
                onClick={() => {
                  openPackDetailsTab(pack.id.toString())
                }}
                onContextMenu={event => openPackMenu(event, pack)}
              >
                <div className="pack-grid-card-image">
                  {thumbnail ? (
                    <img src={thumbnail} alt={pack.name} />
                  ) : (
                    <div className="pack-grid-card-placeholder">
                      <i className="pi pi-box" />
                    </div>
                  )}
                </div>
                <div className="pack-grid-card-content">
                  <h3 className="pack-grid-card-title">{pack.name}</h3>
                  {pack.description && (
                    <p className="pack-grid-card-description">
                      {pack.description}
                    </p>
                  )}
                  {(pack.licenseType || pack.url) && (
                    <div className="pack-grid-card-stats">
                      {pack.licenseType && <span>{pack.licenseType}</span>}
                      {pack.url && <span>Link</span>}
                    </div>
                  )}
                  <div className="pack-grid-card-stats">
                    <span title="Models">
                      <i className="pi pi-box" /> {pack.modelCount}
                    </span>
                    <span title="Global Materials">
                      <i className="pi pi-palette" /> {pack.globalMaterialCount}
                    </span>
                    <span title="Multi-Model Textures">
                      <i className="pi pi-th-large" />{' '}
                      {pack.multiModelTextureCount}
                    </span>
                    <span title="Sprites">
                      <i className="pi pi-image" /> {pack.spriteCount}
                    </span>
                    <span title="Sounds">
                      <i className="pi pi-volume-up" /> {pack.soundCount}
                    </span>
                    <span title="Environment maps">
                      <i className="pi pi-globe" />{' '}
                      {pack.environmentMapCount ?? 0}
                    </span>
                  </div>
                </div>
                <div className="pack-grid-card-actions">
                  <Button
                    icon="pi pi-ellipsis-v"
                    className="p-button-text p-button-rounded p-button-sm"
                    aria-label={`Pack actions for ${pack.name}`}
                    aria-haspopup="menu"
                    title="Pack actions"
                    disabled={deletePackMutation.isPending}
                    onClick={e => {
                      e.stopPropagation()
                      openPackMenu(e, pack)
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ContextMenu
        ref={contextMenu}
        model={contextMenuItems}
        onHide={() => setContextPack(null)}
      />

      <CreatePackDialog
        visible={showCreateDialog}
        onHide={() => setShowCreateDialog(false)}
      />
    </div>
  )
}
