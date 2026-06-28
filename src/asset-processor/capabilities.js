/**
 * Tracks this worker's detected render backend so the app can show which path
 * thumbnails actually render on. `WebGPURenderer` comes up on a WebGPU backend
 * when the container exposes one (fast) and falls back to a WebGL2 backend
 * otherwise; the backend isn't known until a renderer is initialised for the
 * first job, so it stays `null` ("detecting") until then.
 *
 * The PuppeteerRenderer sets it at renderer init; the health server and the
 * job-poll request read it so it can reach the backend API and Settings UI.
 */
let renderBackend = null // 'WebGPU' | 'WebGL2' | null

/** @param {'WebGPU' | 'WebGL2'} backend */
export function setRenderBackend(backend) {
  renderBackend = backend
}

export function getRenderBackend() {
  return renderBackend
}

/** Capability snapshot for /health and the dequeue request. */
export function getCapabilities() {
  return {
    // null until the first model render initialises a renderer.
    renderBackend,
    webgpuAvailable: renderBackend === 'WebGPU',
  }
}
