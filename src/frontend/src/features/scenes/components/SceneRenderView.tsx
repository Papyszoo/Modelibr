import './SceneRenderView.css'

import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'

import { useSceneByIdQuery } from '../api/queries'
import { buildSceneNodeFacts } from '../lib/sceneNodeFacts'
import { frameSceneCamera, type SceneViewpoint } from '../lib/sceneRenderCamera'
import { SceneCanvas } from './SceneCanvas'

/**
 * The scene drawn full-bleed with no editor chrome, for a headless renderer to
 * screenshot.
 *
 * **Deliberately renders through `SceneCanvas` - the same component the editor
 * draws with.** A second renderer would have to re-derive auxiliary-file
 * resolution, texture-set binding and the measured-origin ground rest, and those
 * are precisely the things that have been wrong twice. If the render and the
 * editor can disagree, an agent checking its own work against a render learns
 * nothing.
 *
 * Readiness is published on `window.__SCENE_RENDER__`; the renderer waits for
 * `ready` before it screenshots. "Ready" means every visible node has stopped
 * loading - **including the ones that failed**, which are part of what the scene
 * currently looks like and must not be hidden from the picture.
 */
export interface SceneRenderStatus {
  ready: boolean
  nodesExpected: number
  nodesLoaded: number
  nodesFailed: number
  /** Set when the scene itself could not be read; `ready` is true so the renderer stops waiting. */
  error?: string
}

declare global {
  interface Window {
    __SCENE_RENDER__?: SceneRenderStatus
  }
}

interface SceneRenderViewProps {
  sceneId: number
  viewpoint: SceneViewpoint
}

export function SceneRenderView({
  sceneId,
  viewpoint,
}: SceneRenderViewProps): JSX.Element {
  const { data: view, error } = useSceneByIdQuery({ sceneId })
  const [settled, setSettled] = useState<Map<string, boolean>>(() => new Map())

  const nodeFacts = useMemo(() => buildSceneNodeFacts(view), [view])

  // Hidden nodes render nothing and so never settle; waiting on them would hang
  // the render forever.
  const nodesExpected = useMemo(
    () => (view?.document.nodes ?? []).filter(node => node.visible).length,
    [view]
  )

  const handleNodeSettled = useCallback((nodeId: string, loaded: boolean) => {
    setSettled(previous => {
      if (previous.get(nodeId) === loaded) {
        return previous
      }
      const next = new Map(previous)
      next.set(nodeId, loaded)
      return next
    })
  }, [])

  // A failed node is reported through the settle signal instead; the render
  // shows its failure marker rather than suppressing the node.
  const handleNodeError = useCallback(() => {}, [])

  const nodesFailed = useMemo(
    () => [...settled.values()].filter(loaded => !loaded).length,
    [settled]
  )
  const nodesLoaded = settled.size - nodesFailed
  const message = error
    ? error instanceof Error
      ? error.message
      : String(error)
    : undefined

  useEffect(() => {
    if (message) {
      // Ready on purpose: the scene is never going to draw, and a renderer that
      // waited for it would burn its whole timeout before reporting anything.
      window.__SCENE_RENDER__ = {
        ready: true,
        nodesExpected: 0,
        nodesLoaded: 0,
        nodesFailed: 0,
        error: message,
      }
      return
    }

    window.__SCENE_RENDER__ = {
      ready: Boolean(view) && settled.size >= nodesExpected,
      nodesExpected,
      nodesLoaded,
      nodesFailed,
    }
  }, [message, view, settled.size, nodesExpected, nodesLoaded, nodesFailed])

  if (message || !view) {
    return <div className="scene-render-view" />
  }

  return (
    <div className="scene-render-view" data-testid="scene-render-view">
      <SceneCanvas
        document={view.document}
        nodeFacts={nodeFacts}
        selectedNodeId={null}
        onSelectNode={() => {}}
        onNodeLoadError={handleNodeError}
        onNodeLoadSettled={handleNodeSettled}
        camera={frameSceneCamera(view, viewpoint)}
        showGrid={false}
        interactive={false}
      />
    </div>
  )
}
