import './SceneEditor.css'

import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'

import { ApiClientError } from '@/lib/apiBase'
import { ErrorState, ListHeader, LoadingState } from '@/shared/components'
import { useSceneEditorStore } from '@/stores'

import { useSaveSceneDocumentMutation, useSceneByIdQuery } from '../api/queries'
import { getSceneAssetFacts } from '../api/scenesApi'
import { transformsEqual } from '../lib/sceneGeometry'
import { nextLightId, nextNodeId, nextPlacementX } from '../lib/sceneNodeIds'
import type { SceneNodeView } from '../types'
import { SceneAssetPicker } from './SceneAssetPicker'
import { SceneCanvas } from './SceneCanvas'
import { SceneHierarchy } from './SceneHierarchy'
import { ScenePropertyPanel } from './ScenePropertyPanel'

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0 }
const UNIT_SCALE = { x: 1, y: 1, z: 1 }

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
    markSaved,
    edit,
    undo,
    redo,
    selectNode,
    setNodeTransform,
    updateNode,
    removeNode,
    addNode,
    setLight,
    past,
    future,
  } = useSceneEditorStore()

  const [placeError, setPlaceError] = useState<string | null>(null)
  const [isPlacing, setIsPlacing] = useState(false)
  const [failedNodes, setFailedNodes] = useState<Map<string, string>>(new Map())

  const handleNodeLoadError = useCallback((nodeId: string, message: string) => {
    setFailedNodes(previous => {
      if (previous.get(nodeId) === message) {
        return previous
      }
      const next = new Map(previous)
      next.set(nodeId, message)
      return next
    })
  }, [])

  // The draft is seeded once per (scene, revision): re-seeding on every render
  // of a fetched query would throw away the user's unsaved edits each time
  // React Query refetched in the background. It is also what makes remounting
  // free - coming back from another tab finds the draft already at this
  // revision, so nothing is re-seeded and nothing is lost.
  const loadedRevision = view?.scene.revision
  useEffect(() => {
    if (view && (baseRevision === null || loadedRevision !== baseRevision)) {
      if (!isDirty) {
        open(sceneId, view.document, view.scene.revision)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, loadedRevision])

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

  /**
   * Places a library model into the draft.
   *
   * The asset's facts are fetched first so the node lands resting on the ground
   * rather than half-buried - the server computes that height with the same
   * code its own `place_asset` uses, so a hand-placed node and an agent-placed
   * one end up in the same spot.
   */
  const handlePlaceModel = useCallback(
    async (model: { id: string; name: string }, versionId: number) => {
      const current = useSceneEditorStore.getState().document
      if (!current) {
        return
      }

      const assetId = Number(model.id)
      setPlaceError(null)
      setIsPlacing(true)

      let groundedY = 0
      let width: number | null = null
      try {
        const facts = await getSceneAssetFacts({
          assetType: 'Model',
          assetId,
          versionId,
        })
        groundedY = facts.groundedYAtOrigin ?? 0
        width = facts.sourceDimensions?.x ?? null
      } catch (caught) {
        // Bounds are advisory: an asset that has never been extracted still
        // places, at y=0, and the panel reports its bounds as unknown. Refusing
        // the placement would make an un-extracted library unusable by hand.
        setPlaceError(
          caught instanceof ApiClientError
            ? `Placed without bounds: ${caught.message}`
            : 'Placed without bounds - this asset has no derived size yet.'
        )
      } finally {
        setIsPlacing(false)
      }

      const nodeId = nextNodeId(current, `model-${assetId}`)
      addNode({
        id: nodeId,
        name: model.name,
        transform: {
          position: { x: nextPlacementX(current, width), y: groundedY, z: 0 },
          rotationEuler: IDENTITY_ROTATION,
          scale: UNIT_SCALE,
        },
        asset: { assetType: 'Model', assetId, versionId },
        visible: true,
      })
      selectNode(nodeId)
    },
    [addNode, selectNode]
  )

  const handleAddPrimitive = useCallback(() => {
    const current = useSceneEditorStore.getState().document
    if (!current) {
      return
    }

    const nodeId = nextNodeId(current, 'box')
    addNode({
      id: nodeId,
      name: 'Blockout box',
      transform: {
        // Primitives are authored centered, so half its height puts it on the
        // floor - the same offset the server's footprint uses for them.
        position: { x: nextPlacementX(current, 1), y: 0.5, z: 0 },
        rotationEuler: IDENTITY_ROTATION,
        scale: UNIT_SCALE,
      },
      primitive: { shape: 'box', size: { x: 1, y: 1, z: 1 } },
      visible: true,
    })
    selectNode(nodeId)
  }, [addNode, selectNode])

  const handleAddLight = useCallback(() => {
    const current = useSceneEditorStore.getState().document
    if (!current) {
      return
    }

    setLight({
      id: nextLightId(current, 'light'),
      type: 'directional',
      position: { x: 6, y: 10, z: 6 },
      intensity: 1.1,
      color: '#ffffff',
      name: 'Key light',
    })
  }, [setLight])

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
      // The document that was actually sent, so edits made while the request
      // was in flight stay dirty instead of being marked saved unsent.
      markSaved(saved.scene.revision, document)
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
    return <LoadingState message="Loading scene…" />
  }

  if (error || !view) {
    return (
      <ErrorState
        title="This scene could not be opened"
        message={
          error instanceof ApiClientError
            ? error.message
            : 'The scene could not be loaded.'
        }
        action={
          <Button
            label="Back to scenes"
            icon="pi pi-arrow-left"
            size="small"
            onClick={onClose}
          />
        }
      />
    )
  }

  if (!document) {
    return <LoadingState message="Preparing editor…" />
  }

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  return (
    <div className="scene-editor" data-testid="scene-editor">
      <ListHeader
        variant="tab"
        className="scene-editor-header"
        title={
          <span className="scene-editor-title">
            <Button
              icon="pi pi-arrow-left"
              text
              rounded
              size="small"
              aria-label="Back to scenes"
              tooltip="Back to scenes"
              onClick={onClose}
            />
            {view.scene.name}
          </span>
        }
        stats={[
          { icon: 'pi-box', label: `${document.nodes.length} nodes` },
          { icon: 'pi-sun', label: `${document.lights.length} lights` },
          { icon: 'pi-history', label: `rev ${baseRevision}` },
        ]}
        actions={
          <div className="scene-editor-actions">
            <Button
              icon="pi pi-undo"
              text
              size="small"
              aria-label="Undo"
              data-testid="scene-editor-undo"
              tooltip="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={undo}
            />
            <Button
              icon="pi pi-refresh"
              text
              size="small"
              aria-label="Redo"
              tooltip="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo}
              onClick={redo}
            />
            <Button
              data-testid="scene-editor-save"
              label={isDirty ? 'Save' : 'Saved'}
              icon={isDirty ? 'pi pi-save' : 'pi pi-check'}
              size="small"
              loading={save.isPending}
              disabled={!isDirty || save.isPending}
              onClick={() => void handleSave()}
            />
          </div>
        }
      />

      {saveError ? (
        <Message
          severity="error"
          text={saveError}
          className="scene-editor-message"
        />
      ) : null}

      {placeError ? (
        <Message
          severity="warn"
          text={placeError}
          className="scene-editor-message"
        />
      ) : null}

      <div className="scene-editor-body">
        <aside className="scene-editor-side">
          <SceneAssetPicker
            disabled={isPlacing}
            onPlace={(model, versionId) =>
              void handlePlaceModel(model, versionId)
            }
          />

          <div className="scene-editor-add-row">
            <Button
              label="Blockout box"
              icon="pi pi-stop"
              size="small"
              outlined
              onClick={handleAddPrimitive}
            />
            <Button
              label="Light"
              icon="pi pi-sun"
              size="small"
              outlined
              onClick={handleAddLight}
            />
          </div>

          <SceneHierarchy
            document={document}
            nodeFacts={nodeFacts}
            failedNodes={failedNodes}
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
          onNodeLoadError={handleNodeLoadError}
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
