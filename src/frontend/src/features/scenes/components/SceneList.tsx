import './SceneList.css'

import { type JSX, useState } from 'react'

import { ApiClientError } from '@/lib/apiBase'

import {
  useCreateSceneMutation,
  useDeleteSceneMutation,
  useScenesQuery,
} from '../api/queries'

interface SceneListProps {
  onOpenScene: (sceneId: number) => void
}

export function SceneList({ onOpenScene }: SceneListProps): JSX.Element {
  const { data: scenes, isLoading, error } = useScenesQuery()
  const createScene = useCreateSceneMutation()
  const deleteScene = useDeleteSceneMutation()
  const [name, setName] = useState('')

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }

    const created = await createScene.mutateAsync({ name: trimmed })
    setName('')
    onOpenScene(created.scene.id)
  }

  if (isLoading) {
    return <div className="scene-list-status">Loading scenes…</div>
  }

  if (error) {
    return (
      <div className="scene-list-status scene-list-status--error">
        {error instanceof ApiClientError
          ? error.message
          : 'Scenes could not be loaded.'}
      </div>
    )
  }

  return (
    <div className="scene-list" data-testid="scene-list">
      <header className="scene-list-header">
        <h1>Scenes</h1>
        <div className="scene-list-create">
          <input
            type="text"
            value={name}
            placeholder="New scene name"
            aria-label="New scene name"
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                void handleCreate()
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!name.trim() || createScene.isPending}
          >
            Create
          </button>
        </div>
      </header>

      {scenes && scenes.length > 0 ? (
        <ul className="scene-list-items">
          {scenes.map(scene => (
            <li key={scene.id} className="scene-list-item">
              <button
                type="button"
                className="scene-list-open"
                onClick={() => onOpenScene(scene.id)}
              >
                <span className="scene-list-name">{scene.name}</span>
                <span className="scene-list-meta">
                  {scene.nodeCount < 0
                    ? // The server could not read this scene's document. It is
                      // listed anyway - hiding it is how a user loses a scene
                      // without being told it is in trouble.
                      'document unreadable'
                    : `${scene.nodeCount} node${scene.nodeCount === 1 ? '' : 's'} · ${scene.lightCount} light${scene.lightCount === 1 ? '' : 's'}`}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${scene.name}`}
                className="scene-list-delete"
                onClick={() => void deleteScene.mutateAsync(scene.id)}
              >
                <i className="pi pi-trash" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="scene-list-empty">
          No scenes yet. Create one, then place assets from the library - or let
          an agent build it over MCP.
        </p>
      )}
    </div>
  )
}
