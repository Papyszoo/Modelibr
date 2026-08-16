import './SceneList.css'

import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { type JSX, useState } from 'react'

import { AddTile, AssetGrid, AssetTile } from '@/shared/components/asset-tile'
import {
  Dialog,
  EmptyState,
  ErrorState,
  ListHeader,
  LoadingState,
} from '@/shared/components'
import { ApiClientError } from '@/lib/apiBase'

import {
  useCreateSceneMutation,
  useDeleteSceneMutation,
  useScenesQuery,
} from '../api/queries'
import type { SceneSummary } from '../types'

interface SceneListProps {
  onOpenScene: (sceneId: number) => void
}

export function SceneList({ onOpenScene }: SceneListProps): JSX.Element {
  const { data: scenes, isLoading, error, refetch } = useScenesQuery()
  const createScene = useCreateSceneMutation()
  const deleteScene = useDeleteSceneMutation()

  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pendingDelete, setPendingDelete] = useState<SceneSummary | null>(null)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }

    const created = await createScene.mutateAsync({
      name: trimmed,
      description: description.trim() || undefined,
    })
    setIsCreating(false)
    setName('')
    setDescription('')
    onOpenScene(created.scene.id)
  }

  if (isLoading) {
    return <LoadingState message="Loading scenes…" />
  }

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof ApiClientError
            ? error.message
            : 'Scenes could not be loaded.'
        }
        onRetry={() => void refetch()}
      />
    )
  }

  const items = scenes ?? []

  return (
    <div className="scene-list" data-testid="scene-list">
      <ListHeader
        title="Scenes"
        subtitle="Compose library assets into a scene - by hand, or through an agent over MCP."
        stats={[{ icon: 'pi-box', label: `${items.length} scenes` }]}
        actions={
          <Button
            icon="pi pi-plus"
            label="New scene"
            size="small"
            data-testid="scene-list-new"
            onClick={() => setIsCreating(true)}
          />
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon="pi-box"
          title="No scenes yet"
          message="A scene holds library assets placed in 3D space. Create one, then add models to it."
          action={
            <Button
              icon="pi pi-plus"
              label="New scene"
              size="small"
              onClick={() => setIsCreating(true)}
            />
          }
        />
      ) : (
        <AssetGrid cardWidth={200} className="scene-list-grid">
          {items.map(scene => (
            <AssetTile
              key={scene.id}
              name={scene.name}
              meta={describeScene(scene)}
              dataAttributes={{
                'data-testid': 'scene-tile',
                'data-scene-id': scene.id,
              }}
              onClick={() => onOpenScene(scene.id)}
              onContextMenu={event => {
                event.preventDefault()
                setPendingDelete(scene)
              }}
              media={
                // Scenes have no preview render yet, so the tile shows the
                // scene glyph rather than an empty frame. When the render-back
                // lands this is where its image goes.
                <div className="scene-list-tile-media">
                  <i className="pi pi-box" aria-hidden />
                </div>
              }
            />
          ))}
          <AddTile label="New scene" onClick={() => setIsCreating(true)} />
        </AssetGrid>
      )}

      <Dialog
        open={isCreating}
        onClose={() => setIsCreating(false)}
        header="New scene"
        size="sm"
        footer={
          <>
            <Button
              label="Cancel"
              text
              size="small"
              onClick={() => setIsCreating(false)}
            />
            <Button
              label="Create"
              icon="pi pi-check"
              size="small"
              data-testid="scene-create-confirm"
              disabled={!name.trim() || createScene.isPending}
              loading={createScene.isPending}
              onClick={() => void handleCreate()}
            />
          </>
        }
      >
        <div className="scene-list-form">
          <label htmlFor="scene-name">Name</label>
          <InputText
            id="scene-name"
            value={name}
            autoFocus
            placeholder="Rundown city street"
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                void handleCreate()
              }
            }}
          />

          <label htmlFor="scene-description">Description</label>
          <InputTextarea
            id="scene-description"
            value={description}
            rows={3}
            autoResize
            placeholder="What this scene is for - optional, and useful to an agent."
            onChange={event => setDescription(event.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        header="Delete scene"
        size="sm"
        footer={
          <>
            <Button
              label="Cancel"
              text
              size="small"
              onClick={() => setPendingDelete(null)}
            />
            <Button
              label="Delete"
              icon="pi pi-trash"
              severity="danger"
              size="small"
              loading={deleteScene.isPending}
              onClick={async () => {
                if (pendingDelete) {
                  await deleteScene.mutateAsync(pendingDelete.id)
                }
                setPendingDelete(null)
              }}
            />
          </>
        }
      >
        <p className="scene-list-confirm">
          Delete <strong>{pendingDelete?.name}</strong>? The assets it
          references are not affected - only the composition is removed.
        </p>
      </Dialog>
    </div>
  )
}

/**
 * The tile's second line. A scene whose document the server could not read
 * reports -1 counts; saying so is the point - hiding a broken scene is how a
 * user loses one without being told.
 */
function describeScene(scene: SceneSummary): string {
  if (scene.nodeCount < 0) {
    return 'Document unreadable'
  }

  const nodes = `${scene.nodeCount} node${scene.nodeCount === 1 ? '' : 's'}`
  const lights = `${scene.lightCount} light${scene.lightCount === 1 ? '' : 's'}`
  return `${nodes} · ${lights}`
}
