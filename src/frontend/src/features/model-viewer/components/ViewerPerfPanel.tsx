import './ViewerPerfPanel.css'

import { useFrame, useThree } from '@react-three/fiber'
import { type MutableRefObject, useEffect, useRef, useState } from 'react'

import { type PerfStats } from './viewerPerfStats'

/**
 * Live render stats for the model preview. Reads `renderer.info` directly each
 * frame (draw calls, triangles, geometries, textures + a sampled FPS / frame
 * time), so it has no WebGL-context/extension dependency and adds no overhead
 * when hidden.
 *
 * Split in two so sampling never re-renders the 3D scene: {@link PerfSampler}
 * runs inside the Canvas and writes into a shared ref each frame; {@link
 * PerfDisplay} lives in normal DOM outside the Canvas and polls that ref a few
 * times a second to paint the HUD.
 */

const SAMPLE_INTERVAL_MS = 250

interface RendererInfo {
  render?: { drawCalls?: number; calls?: number; triangles?: number }
  memory?: { geometries?: number; textures?: number }
}

/** Inside the Canvas: sample renderer stats into `statsRef` (no React render). */
export function PerfSampler({
  statsRef,
}: {
  statsRef: MutableRefObject<PerfStats>
}) {
  const gl = useThree(s => s.gl)
  const frames = useRef(0)
  const elapsed = useRef(0)
  const last = useRef(performance.now())

  useFrame(() => {
    const now = performance.now()
    elapsed.current += now - last.current
    last.current = now
    frames.current += 1

    if (elapsed.current >= SAMPLE_INTERVAL_MS) {
      const info = (gl as unknown as { info?: RendererInfo }).info
      const render = info?.render
      const memory = info?.memory
      statsRef.current = {
        fps: Math.round((frames.current * 1000) / elapsed.current),
        ms: Number((elapsed.current / frames.current).toFixed(1)),
        // WebGLRenderer exposes `render.calls`; keep `drawCalls` too so the
        // panel survives a future renderer swap without code changes.
        drawCalls: render?.drawCalls ?? render?.calls ?? 0,
        triangles: render?.triangles ?? 0,
        geometries: memory?.geometries ?? 0,
        textures: memory?.textures ?? 0,
      }
      frames.current = 0
      elapsed.current = 0
    }
  })

  return null
}

/** Outside the Canvas: paint the HUD by polling `statsRef` a few times a second. */
export function PerfDisplay({
  statsRef,
}: {
  statsRef: MutableRefObject<PerfStats>
}) {
  const [stats, setStats] = useState<PerfStats>(statsRef.current)

  useEffect(() => {
    const id = window.setInterval(
      () => setStats({ ...statsRef.current }),
      SAMPLE_INTERVAL_MS
    )
    return () => window.clearInterval(id)
  }, [statsRef])

  return (
    <div className="viewer-perf-panel" data-testid="viewer-perf-panel">
      <div className="viewer-perf-row">
        <span>FPS</span>
        <span>
          {stats.fps}
          <span className="viewer-perf-muted"> · {stats.ms} ms</span>
        </span>
      </div>
      <div className="viewer-perf-row">
        <span>Draw calls</span>
        <span>{stats.drawCalls.toLocaleString()}</span>
      </div>
      <div className="viewer-perf-row">
        <span>Triangles</span>
        <span>{stats.triangles.toLocaleString()}</span>
      </div>
      <div className="viewer-perf-row">
        <span>Geometries</span>
        <span>{stats.geometries}</span>
      </div>
      <div className="viewer-perf-row">
        <span>Textures</span>
        <span>{stats.textures}</span>
      </div>
    </div>
  )
}
