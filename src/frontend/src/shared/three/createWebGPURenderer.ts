import * as THREE_GPU from 'three/webgpu'

/**
 * Shared async `gl` factory for `@react-three/fiber` `<Canvas>` that spins up a
 * WebGPURenderer instead of R3F's default WebGLRenderer. The renderer drives a
 * WebGPU backend when the browser exposes one (a large perf win for heavy
 * models) and falls back automatically to a WebGL2 backend otherwise, so it is
 * safe to use unconditionally.
 *
 * R3F v9 accepts an async `gl` factory and awaits it. It calls the factory with
 * the canvas (and any other default props) which we forward to the constructor,
 * merging our rendering defaults. The WebGPURenderer MUST be `init()`-ed before
 * first use — that is what makes the factory async.
 *
 * Why a separate three entry: the bundled `three` resolves to the WebGL build
 * (no WebGPURenderer / node materials), so the renderer, node materials and TSL
 * are imported from `three/webgpu` + `three/tsl`. Scene objects loaded through
 * the classic `three` loaders render fine on it via three's duck-typed flags —
 * the same cross-build setup the script scene preview already uses.
 */
export async function createWebGPURenderer(
  props: ConstructorParameters<typeof THREE_GPU.WebGPURenderer>[0] = {}
): Promise<THREE_GPU.WebGPURenderer> {
  const renderer = new THREE_GPU.WebGPURenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    ...props,
  })
  await renderer.init()
  return renderer
}

/**
 * Whether a renderer actually came up on a WebGPU backend (vs the WebGL2
 * fallback). Useful for diagnostics/badges; behaviour is identical either way.
 */
export function isWebGPUBackend(renderer: unknown): boolean {
  const backend = (
    renderer as {
      backend?: { isWebGPUBackend?: boolean; constructor?: { name?: string } }
    }
  )?.backend
  return !!(
    backend &&
    (backend.isWebGPUBackend || backend.constructor?.name === 'WebGPUBackend')
  )
}
