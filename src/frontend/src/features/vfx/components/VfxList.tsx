import './VfxList.css'

import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { type JSX, useMemo, useRef, useState } from 'react'

import { useTabContext } from '@/hooks/useTabContext'
import { ApiClientError } from '@/lib/apiBase'
import {
  Dialog,
  EmptyState,
  ErrorState,
  ListHeader,
  LoadingState,
} from '@/shared/components'
import { AddTile, AssetGrid, AssetTile } from '@/shared/components/asset-tile'

import {
  useCreateVfxMutation,
  useDeleteVfxMutation,
  useVfxListQuery,
} from '../api/queries'
import { DEFAULT_VFX_DEFINITION, formatSeconds } from '../lib/vfxDefaults'
import type { VfxComponentType, VfxSummary } from '../types'
import { VfxTileMedia } from './VfxTileMedia'

const TYPE_ICONS: Record<VfxComponentType, string> = {
  particles: 'pi pi-sparkles',
  mesh: 'pi pi-box',
  light: 'pi pi-sun',
  sound: 'pi pi-volume-up',
}

const TYPE_LABELS: Record<VfxComponentType, string> = {
  particles: 'Particles',
  mesh: 'Mesh',
  light: 'Light',
  sound: 'Sound',
}

/**
 * The VFX list: every effect, with what it is made of and how long it runs.
 *
 * Creating goes straight to the editor rather than through a form - an effect
 * is authored by laying components on the timeline, and a name typed into a
 * dialog first is a step nobody wants before the thing that matters.
 */
export function VfxList(): JSX.Element {
  const { openVfxEditorTab } = useTabContext()
  const { data: effects, isLoading, error, refetch } = useVfxListQuery()
  const createEffect = useCreateVfxMutation()
  const deleteEffect = useDeleteVfxMutation()

  const [pendingDelete, setPendingDelete] = useState<VfxSummary | null>(null)
  const [contextEffect, setContextEffect] = useState<VfxSummary | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const contextMenu = useRef<ContextMenu>(null)

  // Card actions live behind the same right-click context menu as model cards -
  // a right-click must never go straight into a destructive confirm. Effects
  // have no recycle bin, so the destructive item is Delete, which opens the
  // confirm below.
  const contextMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        label: 'Open',
        icon: 'pi pi-external-link',
        command: () => {
          if (contextEffect) {
            openVfxEditorTab(String(contextEffect.id), contextEffect.name)
          }
        },
      },
      { separator: true },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        command: () => {
          if (!contextEffect) return
          setDeleteError(null)
          setPendingDelete(contextEffect)
        },
      },
    ],
    [contextEffect, openVfxEditorTab]
  )

  const handleCreate = async () => {
    if (createEffect.isPending) return
    setCreateError(null)
    try {
      const created = await createEffect.mutateAsync({
        name: 'New effect',
        definition: DEFAULT_VFX_DEFINITION,
      })
      openVfxEditorTab(String(created.id), created.name)
    } catch (caught) {
      setCreateError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The effect could not be created.'
      )
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading effects..." />
  }

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof ApiClientError
            ? error.message
            : 'Effects could not be loaded.'
        }
        onRetry={() => void refetch()}
      />
    )
  }

  const items = effects ?? []

  return (
    <div className="vfx-list" data-testid="vfx-list">
      <ListHeader
        title="VFX"
        subtitle="Layer particles, meshes, lights and sounds on one timeline."
        stats={[{ icon: 'pi-sparkles', label: `${items.length} effects` }]}
        actions={
          <Button
            icon="pi pi-plus"
            label="New effect"
            size="small"
            data-testid="vfx-create"
            loading={createEffect.isPending}
            onClick={() => void handleCreate()}
          />
        }
      />

      {createError ? (
        <p className="vfx-list-error" data-testid="vfx-create-error">
          {createError}
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon="pi-sparkles"
          title="No effects yet"
          message="No effects yet. Create one to start."
          action={
            <Button
              icon="pi pi-plus"
              label="New effect"
              size="small"
              data-testid="vfx-create-empty"
              loading={createEffect.isPending}
              onClick={() => void handleCreate()}
            />
          }
        />
      ) : (
        <AssetGrid cardWidth={200} className="vfx-list-grid">
          {items.map(effect => (
            <AssetTile
              key={effect.id}
              name={effect.name}
              meta={<VfxTileMeta effect={effect} />}
              dataAttributes={{
                'data-testid': 'vfx-tile',
                'data-vfx-id': effect.id,
              }}
              onClick={() => openVfxEditorTab(String(effect.id), effect.name)}
              onContextMenu={event => {
                event.preventDefault()
                setContextEffect(effect)
                contextMenu.current?.show(event)
              }}
              media={
                <VfxTileMedia
                  name={effect.name}
                  thumbnailUrl={effect.thumbnailUrl}
                  placeholder={
                    <div className="vfx-list-tile-media">
                      <i className="pi pi-sparkles" aria-hidden />
                    </div>
                  }
                />
              }
            />
          ))}
          <AddTile label="New effect" onClick={() => void handleCreate()} />
        </AssetGrid>
      )}

      <Dialog
        open={pendingDelete !== null}
        onClose={() => {
          setDeleteError(null)
          setPendingDelete(null)
        }}
        header="Delete effect"
        size="sm"
        // Delete is a permanent hard delete (an effect has no recycle bin) and
        // is opened from the card menu, so keep the mask non-dismissable to
        // avoid losing the pending delete on a stray outside click. Cancel and
        // Escape still close it.
        dismissableMask={false}
        footer={
          <>
            <Button
              label="Cancel"
              text
              size="small"
              onClick={() => {
                setDeleteError(null)
                setPendingDelete(null)
              }}
            />
            <Button
              label="Delete"
              icon="pi pi-trash"
              severity="danger"
              size="small"
              data-testid="vfx-delete"
              loading={deleteEffect.isPending}
              onClick={async () => {
                if (!pendingDelete) return
                setDeleteError(null)
                try {
                  await deleteEffect.mutateAsync(pendingDelete.id)
                  setPendingDelete(null)
                } catch (caught) {
                  // A 404 means it is already gone; there is nothing left to
                  // delete, so close rather than report a failure.
                  if (
                    caught instanceof ApiClientError &&
                    caught.status === 404
                  ) {
                    setPendingDelete(null)
                    return
                  }
                  setDeleteError(
                    caught instanceof ApiClientError
                      ? caught.message
                      : 'The effect could not be deleted.'
                  )
                }
              }}
            />
          </>
        }
      >
        <p className="vfx-list-confirm" key="confirm">
          Delete <strong>{pendingDelete?.name}</strong>? The assets it
          references are not affected - only the effect is removed.
        </p>
        {deleteError ? (
          <p
            className="vfx-list-error"
            role="alert"
            data-testid="vfx-delete-error"
            key="error"
          >
            {deleteError}
          </p>
        ) : null}
      </Dialog>

      <ContextMenu
        ref={contextMenu}
        model={contextMenuItems}
        onHide={() => setContextEffect(null)}
      />
    </div>
  )
}

/** The tile's second line: its length, then the component types it holds. */
function VfxTileMeta({ effect }: { effect: VfxSummary }): JSX.Element {
  const types = [...new Set(effect.componentTypes)]
  return (
    <>
      <span>{formatSeconds(effect.duration)}</span>
      <span className="vfx-list-types">
        {types.map(type => (
          <i
            key={type}
            className={TYPE_ICONS[type]}
            title={TYPE_LABELS[type]}
            aria-label={TYPE_LABELS[type]}
          />
        ))}
      </span>
    </>
  )
}
