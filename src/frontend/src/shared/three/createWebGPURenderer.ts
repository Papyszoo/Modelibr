import * as THREE from 'three'
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
/**
 * Browsers whose WebGPU implementation is too immature for this renderer, where
 * we fall back to the reliable WebGL2 backend (`forceWebGL`) instead.
 *
 * Firefox shipped WebGPU in 2025 but currently mis-sizes the renderer's depth
 * attachment relative to the canvas color attachment while a model loads —
 * `GPUValidationError: Attachments have differing sizes (300×150 vs the real
 * canvas)` — and crashes on a null WebGPU context (`addEventListener` of null).
 * Chromium and Safari keep the WebGPU fast path. Revisit as Firefox matures.
 */
export function prefersWebGLFallback(): boolean {
  if (typeof navigator === 'undefined') return false
  return /firefox/i.test(navigator.userAgent)
}

const SOFTWARE_ADAPTER_RE =
  /swiftshader|llvmpipe|lavapipe|software|basic render|microsoft basic/

/**
 * Whether to render on the classic WebGLRenderer (+ GLSL materials) instead of
 * the WebGPURenderer (+ TSL node materials). True when WebGPU is absent, when
 * the only adapter is software (headless SwiftShader in CI, locked-down
 * browsers — where node materials are slow to compile or mis-render), or on
 * Firefox (immature WebGPU). A real GPU keeps the WebGPU fast path. Mirrors the
 * thumbnail worker's dual path so software hosts render reliably + quickly.
 */
export async function shouldUseClassicWebGL(): Promise<boolean> {
  if (prefersWebGLFallback()) return true
  if (typeof navigator === 'undefined' || !navigator.gpu) return true
  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter || adapter.isFallbackAdapter) return true
    const info = (adapter as { info?: Record<string, string> }).info ?? {}
    const haystack =
      `${info.vendor ?? ''} ${info.architecture ?? ''} ${info.device ?? ''} ${info.description ?? ''}`.toLowerCase()
    return SOFTWARE_ADAPTER_RE.test(haystack)
  } catch {
    return true
  }
}

/**
 * `gl` factory for R3F `<Canvas>`. Returns a WebGPURenderer on a real GPU and a
 * classic WebGLRenderer on software/Firefox (see {@link shouldUseClassicWebGL}).
 * Components branch their materials on {@link isWebGPUBackend}: node materials +
 * TSL on WebGPU, classic materials + GLSL on the WebGLRenderer.
 */
export async function createWebGPURenderer(
  props: ConstructorParameters<typeof THREE_GPU.WebGPURenderer>[0] = {}
): Promise<THREE_GPU.WebGPURenderer | THREE.WebGLRenderer> {
  if (await shouldUseClassicWebGL()) {
    return new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      ...(props as THREE.WebGLRendererParameters),
    })
  }
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
