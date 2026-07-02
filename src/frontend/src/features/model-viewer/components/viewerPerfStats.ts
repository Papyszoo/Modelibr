/**
 * Shared shape for the model-preview perf HUD. Kept out of the component file so
 * the panel module only exports components (react-refresh constraint).
 */
export interface PerfStats {
  fps: number
  ms: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
}

export const EMPTY_PERF_STATS: PerfStats = {
  fps: 0,
  ms: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
}
