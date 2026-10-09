import './VfxRenderView.css'

import { useProgress } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { type JSX, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

import { useVfxQuery } from '../api/queries'
import { useVfxAssetFiles } from '../hooks/useVfxAssets'
import { useVfxMeshSources } from '../hooks/useVfxMeshSources'
import {
  computeEffectBounds,
  frameThumbnailCamera,
  pointScaleFor,
  type ThumbnailCamera,
  thumbnailWindowSeconds,
} from '../lib/vfxFraming'
import type { VfxDefinition } from '../types'
import { VfxLayers, VfxStage } from './VfxPreview'

/**
 * What the worker reads from the page, on `window.__VFX_RENDER__`.
 *
 * `setTime` is the only way time moves: the worker steps it explicitly and
 * photographs each step, so the thumbnail is the effect at exact instants and
 * never a recording of real-time playback.
 */
export interface VfxRenderStatus {
  ready: boolean
  /** Seconds of effect time one loop covers (see `thumbnailWindowSeconds`). */
  windowSeconds: number
  /** Resolves once the effect at `time` has been drawn. */
  setTime: (time: number) => Promise<void>
  /** Set when the effect could not be read; `ready` is true so the worker stops waiting. */
  error?: string
}

declare global {
  interface Window {
    __VFX_RENDER__?: VfxRenderStatus
  }
}

/** Assets that start loading after the first draw get this long to begin. */
const SETTLE_MS = 300

const neverTimeTravels = (): Promise<void> => Promise.resolve()

interface VfxRenderViewProps {
  vfxId: number
}

/**
 * One effect drawn with no editor chrome, for the worker to photograph.
 *
 * **It mounts the same `VfxLayers` the editor preview draws with**, so the
 * thumbnail can never disagree with what the effect looks like when opened.
 * Only the shell differs: a fixed camera framed from the effect's bounds, no
 * controls and no grid.
 */
export function VfxRenderView({ vfxId }: VfxRenderViewProps): JSX.Element {
  const { data: vfx, error } = useVfxQuery(vfxId)
  const message = error
    ? error instanceof Error
      ? error.message
      : String(error)
    : undefined

  useEffect(() => {
    if (!message) return
    // Ready on purpose: the effect is never going to draw, and a worker that
    // waited for it would burn its whole timeout before reporting anything.
    window.__VFX_RENDER__ = {
      ready: true,
      windowSeconds: 0,
      setTime: neverTimeTravels,
      error: message,
    }
  }, [message])

  if (message || !vfx) {
    return <div className="vfx-render-view" />
  }

  return <LoadedVfxRender definition={vfx.definition} />
}

function LoadedVfxRender({
  definition,
}: {
  definition: VfxDefinition
}): JSX.Element {
  const [time, setTime] = useState(0)
  const { sources, settled: meshesSettled } = useVfxMeshSources(definition)
  const { spriteFiles } = useVfxAssetFiles(definition)
  const { active: assetsLoading } = useProgress()

  const windowSeconds = useMemo(
    () => thumbnailWindowSeconds(definition),
    [definition]
  )
  const camera = useMemo(
    () => frameThumbnailCamera(computeEffectBounds(definition, windowSeconds)),
    [definition, windowSeconds]
  )

  const [canvasReady, setCanvasReady] = useState(false)
  const [settledLong, setSettledLong] = useState(false)
  const idle = meshesSettled && !assetsLoading && canvasReady

  // "Nothing loading" has to hold for a moment: a model's own load starts a
  // render after its source resolves, so the first idle instant can be a gap.
  useEffect(() => {
    if (!idle) {
      setSettledLong(false)
      return
    }
    const timer = window.setTimeout(() => setSettledLong(true), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [idle])

  useEffect(() => {
    window.__VFX_RENDER__ = {
      ready: settledLong,
      windowSeconds,
      setTime: next =>
        new Promise<void>(resolve => {
          // Commit synchronously, then wait for the canvas to present the
          // frame, so the worker's screenshot is of this very instant.
          flushSync(() => setTime(next))
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }),
    }
  }, [settledLong, windowSeconds])

  return (
    <div className="vfx-render-view" data-testid="vfx-render-view">
      <Canvas
        dpr={1}
        gl={{ antialias: true }}
        camera={{ fov: camera.fov, near: 0.1, far: 200 }}
      >
        <CameraRig camera={camera} onMounted={() => setCanvasReady(true)} />
        <VfxStage floor={false} />
        <PointScaleLayers
          definition={definition}
          time={time}
          spriteFiles={spriteFiles}
          sources={sources}
          fov={camera.fov}
        />
      </Canvas>
    </div>
  )
}

/** Particle sizes follow the canvas height, so a thumbnail looks like the editor view shrunk. */
function PointScaleLayers({
  fov,
  ...layers
}: Omit<Parameters<typeof VfxLayers>[0], 'selectedId' | 'pointScale'> & {
  fov: number
}): JSX.Element {
  const height = useThree(state => state.size.height)
  return (
    <VfxLayers
      {...layers}
      selectedId={null}
      pointScale={pointScaleFor(height, fov)}
    />
  )
}

function CameraRig({
  camera,
  onMounted,
}: {
  camera: ThumbnailCamera
  onMounted: () => void
}): null {
  const three = useThree(state => state.camera)

  useLayoutEffect(() => {
    three.position.set(...camera.position)
    three.lookAt(...camera.target)
    three.updateProjectionMatrix()
    onMounted()
  }, [three, camera, onMounted])

  return null
}
