import './SceneEditor.css'

import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'

import { ApiClientError } from '@/lib/apiBase'
import { useSceneEditorStore } from '@/stores'

import { useSaveSceneDocumentMutation, useSceneByIdQuery } from '../api/queries'
import { transformsEqual } from '../lib/sceneGeometry'
import type { SceneNodeView } from '../types'
import { SceneCanvas } from './SceneCanvas'
import { SceneHierarchy } from './SceneHierarchy'
import { ScenePropertyPanel } from './ScenePropertyPanel'

interface SceneEditorProps {
  sceneId: number
  onClose: () => void
}

export function SceneEditor({
  sceneId,
  onClose,
}: SceneEditorProps): JSX.Element {
  const { data: view, isLoading, error } = useSceneByIdQuery({ sceneId })
  const save = useSaveSceneDocumentMutation()
  const [saveError, setSaveError] = useState<string | null>(null)

  const {
    document,
    baseRevision,
    isDirty,
    selectedNodeId,
    open,
    close,
    markSaved,
    edit,
    undo,
    redo,
    selectNode,
    setNodeTransform,
    updateNode,
    removeNode,
  } = useSceneEditorStore()

  // The draft is seeded once per (scene, revision): re-seeding on every render
  // of a fetched query would throw away the user's unsaved edits each time
  // React Query refetched in the background.
  const loadedRevision = view?.scene.revision
  useEffect(() => {
    if (view && (baseRevision === null || loadedRevision !== baseRevision)) {
      if (!isDirty) {
        open(sceneId, view.document, view.scene.revision)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, loadedRevision])

  useEffect(() => close, [close])

  const nodeFacts = useMemo(() => {
    const map = new Map<string, SceneNodeView>()
    for (const node of view?.nodes ?? []) {
      map.set(node.nodeId, node)
    }
    return map
  }, [view])

  const selectedNode =
    document?.nodes.find(node => node.id === selectedNodeId) ?? null
  const selectedFacts = selectedNodeId
    ? (nodeFacts.get(selectedNodeId) ?? null)
    : null

  // The server computed groundOffset against the transform it last saw. Once
  // the node has moved locally that number describes a position the node is no
  // longer in, so the action is withheld until the next save rather than
  // applying an offset that would put the node somewhere neither the user nor
  // the server asked for.
  const groundOffset =
    selectedFacts &&
    transformsEqual(selectedFacts.transform, selectedNode?.transform)
      ? selectedFacts.groundOffset
      : null

  const handleSave = useCallback(async () => {
    if (!document || baseRevision === null) {
      return
    }

    setSaveError(null)
    try {
      const saved = await save.mutateAsync({
        sceneId,
        document,
        expectedRevision: baseRevision,
      })
      markSaved(saved.scene.revision)
    } catch (caught) {
      // The server rejects an invalid document in full and says why, per
      // problem. Surfacing that verbatim is the point: the alternative this
      // replaces silently swapped in an empty scene.
      setSaveError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The scene could not be saved.'
      )
    }
  }, [document, baseRevision, sceneId, save, markSaved])

  // Undo/redo on the usual chord. Scoped to the editor being mounted, and
  // ignored while a text field has focus so typing in the name box does not
  // roll back a placement.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'z'
      ) {
        return
      }

      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      event.preventDefault()
      if (event.shiftKey) {
        redo()
      } else {
        undo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  if (isLoading) {
    return <div className="scene-editor-status">Loading scene…</div>
  }

  if (error || !view) {
    return (
      <div className="scene-editor-status scene-editor-status--error">
        {error instanceof ApiClientError
          ? error.message
          : 'This scene could not be opened.'}
        <button type="button" onClick={onClose}>
          Back to scenes
        </button>
      </div>
    )
  }

  if (!document) {
    return <div className="scene-editor-status">Preparing editor…</div>
  }

  return (
    <div className="scene-editor" data-testid="scene-editor">
      <header className="scene-editor-toolbar">
        <button type="button" onClick={onClose} aria-label="Back to scenes">
          <i className="pi pi-arrow-left" />
        </button>
        <h2>{view.scene.name}</h2>
        <span className="scene-editor-revision">rev {baseRevision}</span>

        <div className="scene-editor-toolbar-actions">
          <button
            type="button"
            onClick={undo}
            disabled={!useSceneEditorStore.getState().canUndo()}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!useSceneEditorStore.getState().canRedo()}
          >
            Redo
          </button>
          <button
            type="button"
            className="scene-editor-save"
            onClick={() => void handleSave()}
            disabled={!isDirty || save.isPending}
          >
            {save.isPending ? 'Saving…' : isDirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </header>

      {saveError ? (
        <p className="scene-editor-error" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="scene-editor-body">
        <aside className="scene-editor-side">
          <SceneHierarchy
            document={document}
            nodeFacts={nodeFacts}
            overlaps={view.overlaps}
            selectedNodeId={selectedNodeId}
            onSelectNode={selectNode}
            onToggleVisible={(nodeId, visible) =>
              updateNode(nodeId, { visible })
            }
            onRemoveNode={removeNode}
          />
        </aside>

        <SceneCanvas
          document={document}
          nodeFacts={nodeFacts}
          selectedNodeId={selectedNodeId}
          onSelectNode={selectNode}
        />

        <aside className="scene-editor-side scene-editor-side--right">
          <ScenePropertyPanel
            node={selectedNode}
            facts={selectedFacts}
            warnings={view.scaleWarnings.filter(
              warning => warning.nodeId === selectedNodeId
            )}
            onChangeTransform={transform => {
              if (selectedNodeId) {
                setNodeTransform(selectedNodeId, transform)
              }
            }}
            onRename={name => {
              if (selectedNodeId) {
                updateNode(selectedNodeId, { name: name || null })
              }
            }}
            groundOffset={groundOffset}
            onGroundSnap={() => {
              if (!selectedNodeId || !selectedNode || groundOffset == null) {
                return
              }

              const offset = groundOffset

              edit(current => ({
                ...current,
                nodes: current.nodes.map(node =>
                  node.id === selectedNodeId
                    ? {
                        ...node,
                        transform: {
                          ...node.transform,
                          position: {
                            ...node.transform.position,
                            y: node.transform.position.y + offset,
                          },
                        },
                      }
                    : node
                ),
              }))
            }}
          />
        </aside>
      </div>
    </div>
  )
}
