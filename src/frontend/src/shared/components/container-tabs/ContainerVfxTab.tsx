import { useMutation } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { useRef, useState } from 'react'

import { useVfxListQuery } from '@/features/vfx/api/queries'
import { VfxTileMedia } from '@/features/vfx/components/VfxTileMedia'
import { formatSeconds } from '@/features/vfx/lib/vfxDefaults'
import { useTabContext } from '@/hooks/useTabContext'
import {
  AddTile,
  ASSET_CARD_WIDTH,
  AssetGrid,
  AssetTile,
  AssetTilePlaceholder,
} from '@/shared/components/asset-tile'
import { EmptyState } from '@/shared/components/feedback'
import {
  ListToolbar,
  ListToolbarActions,
  ListToolbarButton,
  ListToolbarCount,
  ListToolbarRow,
} from '@/shared/components/list-toolbar'
import { Dialog } from '@/shared/components/overlay'
import {
  type ContainerAdapter,
  type ContainerDto,
} from '@/shared/types/ContainerTypes'

interface ContainerVfxTabProps {
  adapter: ContainerAdapter
  container: ContainerDto
  refetchContainer: () => Promise<void>
  showToast: (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }) => void
}

/**
 * The effects a container holds. Effects have no paging, so the member list
 * comes straight from the container and the library list fills in duration,
 * the animated thumbnail and the add picker.
 */
export function ContainerVfxTab({
  adapter,
  container,
  refetchContainer,
  showToast,
}: ContainerVfxTabProps) {
  const contextMenuRef = useRef<ContextMenu>(null)
  const { openVfxEditorTab } = useTabContext()
  const { data: library = [] } = useVfxListQuery()
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(
    null
  )
  const [showAdd, setShowAdd] = useState(false)
  const [pickedIds, setPickedIds] = useState<number[]>([])

  const members = container.vfx ?? []
  const memberIds = new Set(members.map(member => member.id))
  const available = library.filter(effect => !memberIds.has(effect.id))
  const summaryOf = (id: number) => library.find(effect => effect.id === id)
  const label = adapter.label.toLowerCase()

  const fail = (summary: string) => (error: unknown) =>
    showToast({
      severity: 'error',
      summary,
      detail: error instanceof Error ? error.message : 'The request failed.',
      life: 4000,
    })

  const add = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) await adapter.addVfx?.(adapter.containerId, id)
    },
    onSuccess: async () => {
      setShowAdd(false)
      setPickedIds([])
      await refetchContainer()
    },
    onError: fail('Could not add effects'),
  })

  const remove = useMutation({
    mutationFn: (id: number) =>
      adapter.removeVfx?.(adapter.containerId, id) ?? Promise.resolve(),
    onSuccess: () => refetchContainer(),
    onError: fail('Could not remove effect'),
  })

  const menu: MenuItem[] = [
    {
      label: `Remove from ${label}`,
      icon: 'pi pi-times',
      command: () => {
        if (selected) remove.mutate(selected.id)
      },
    },
  ]

  const effectMedia = (name: string, thumbnailUrl?: string | null) => (
    <VfxTileMedia
      name={name}
      thumbnailUrl={thumbnailUrl}
      placeholder={
        <AssetTilePlaceholder icon="pi pi-sparkles" label="Effect" />
      }
    />
  )

  return (
    <>
      <ContextMenu model={menu} ref={contextMenuRef} />

      <ListToolbar>
        <ListToolbarRow>
          <ListToolbarActions>
            <ListToolbarButton
              icon="pi pi-plus"
              label="Add"
              onClick={() => setShowAdd(true)}
              tooltip="Add effects"
              ariaLabel="Add effects"
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
            icon="pi pi-sparkles"
            count={members.length}
            unitLabel="effect"
          />
        </ListToolbarRow>
      </ListToolbar>

      <div className="container-section">
        <AssetGrid cardWidth={ASSET_CARD_WIDTH.default}>
          {members.map(member => {
            const summary = summaryOf(member.id)
            return (
              <AssetTile
                key={member.id}
                name={member.name}
                meta={summary ? formatSeconds(summary.duration) : undefined}
                media={effectMedia(member.name, summary?.thumbnailUrl)}
                accessory={adapter.renderAssetAccessory?.({
                  type: 'vfx',
                  id: member.id,
                  name: member.name,
                })}
                dataAttributes={{ 'data-vfx-id': member.id }}
                onClick={() => openVfxEditorTab(String(member.id), member.name)}
                onContextMenu={event => {
                  event.preventDefault()
                  setSelected(member)
                  contextMenuRef.current?.show(event)
                }}
              />
            )
          })}
          <AddTile label="Add Effect" onClick={() => setShowAdd(true)} />
        </AssetGrid>
      </div>

      <Dialog
        open={showAdd}
        onClose={() => {
          setShowAdd(false)
          setPickedIds([])
        }}
        header={`Add Effects to ${adapter.label}`}
        size="lg"
        footer={
          <>
            <Button
              label="Cancel"
              text
              onClick={() => {
                setShowAdd(false)
                setPickedIds([])
              }}
            />
            <Button
              label={`Add Selected (${pickedIds.length})`}
              icon="pi pi-check"
              disabled={pickedIds.length === 0 || add.isPending}
              onClick={() => add.mutate(pickedIds)}
            />
          </>
        }
      >
        {available.length === 0 ? (
          <EmptyState
            variant="compact"
            icon="pi-sparkles"
            title="No effects to add"
            message={`Every effect in the library is already in this ${label}.`}
          />
        ) : (
          <AssetGrid cardWidth={160}>
            {available.map(effect => {
              const isPicked = pickedIds.includes(effect.id)
              return (
                <AssetTile
                  key={effect.id}
                  name={effect.name}
                  meta={formatSeconds(effect.duration)}
                  media={effectMedia(effect.name, effect.thumbnailUrl)}
                  selected={isPicked}
                  checkbox={<Checkbox checked={isPicked} readOnly />}
                  onClick={() =>
                    setPickedIds(current =>
                      isPicked
                        ? current.filter(id => id !== effect.id)
                        : [...current, effect.id]
                    )
                  }
                />
              )
            })}
          </AssetGrid>
        )}
      </Dialog>
    </>
  )
}
