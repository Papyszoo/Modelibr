/** Lightweight renderer statistics shared by every Three.js viewport. */
export interface RendererPerfStats {
  fps: number
  ms: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
}

export const EMPTY_RENDERER_PERF_STATS: RendererPerfStats = {
  fps: 0,
  ms: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
}

export interface RendererInfoSnapshot {
  render?: { drawCalls?: number; calls?: number; triangles?: number }
  memory?: { geometries?: number; textures?: number }
}

/** Converts one sampling window and `renderer.info` snapshot into stable metrics. */
export function calculateRendererPerfStats(
  info: RendererInfoSnapshot | undefined,
  frames: number,
  elapsedMs: number
): RendererPerfStats {
  const render = info?.render
  const memory = info?.memory
  const safeFrames = Math.max(frames, 1)
  const safeElapsed = Math.max(elapsedMs, 0)

  return {
    fps: safeElapsed > 0 ? Math.round((safeFrames * 1000) / safeElapsed) : 0,
    ms: Number((safeElapsed / safeFrames).toFixed(1)),
    // WebGLRenderer exposes `render.calls`; keep `drawCalls` too so this survives a
    // future renderer swap without changing every consumer.
    drawCalls: render?.drawCalls ?? render?.calls ?? 0,
    triangles: render?.triangles ?? 0,
    geometries: memory?.geometries ?? 0,
    textures: memory?.textures ?? 0,
  }
}
