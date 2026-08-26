import './ViewerPerfPanel.css'

import { type MutableRefObject, useEffect, useState } from 'react'

import { type RendererPerfStats } from '@/shared/three/rendererPerformance'

/**
 * Live render stats for the model preview. Reads `renderer.info` directly each
 * frame (draw calls, triangles, geometries, textures + a sampled FPS / frame
 * time), so it has no WebGL-context/extension dependency and adds no overhead
 * when hidden.
 *
 * Sampling never re-renders the 3D scene: the shared `RendererPerfSampler` runs
 * inside the Canvas and writes into a ref; this display polls that ref a few
 * times a second to paint the HUD.
 */

const SAMPLE_INTERVAL_MS = 250

/** Outside the Canvas: paint the HUD by polling `statsRef` a few times a second. */
export function PerfDisplay({
  statsRef,
}: {
  statsRef: MutableRefObject<RendererPerfStats>
}) {
  const [stats, setStats] = useState<RendererPerfStats>(statsRef.current)

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
