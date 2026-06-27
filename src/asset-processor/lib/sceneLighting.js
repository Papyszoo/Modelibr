/**
 * Shared scene-lighting rig, used by every runtime that renders a model preview
 * so they all light it identically:
 *   - the frontend viewer (Vite bundle, React-Three-Fiber) — maps the resolved
 *     descriptor to declarative <ambientLight>/<directionalLight>/... primitives,
 *   - the worker Puppeteer thumbnail render (`render-template.html`) — builds
 *     real THREE light instances via buildSceneLights,
 *   - demo mode (browserAssetProcessor) — same builder.
 *
 * Before this module the rig was hand-copied into all three with different
 * numbers, so the in-app viewer (drei <Stage> + a second manual rig) was wildly
 * over-lit and the ambient/environment controls were swamped, while the
 * thumbnail used a single balanced rig. This is the single source of truth for
 * the balanced rig (the thumbnail's numbers win).
 *
 * THREE is injected (like the TIFF decoder's UTIF and stlMesh's THREE) so the
 * one file runs in both a bundler and a raw browser page without pulling in a
 * second three instance.
 */

/**
 * The canonical balanced rig — these are the worker thumbnail's numbers, which
 * are the reference "correct" look. Direct lights are deliberately low so PBR
 * materials aren't overexposed; the image-based lighting (environmentIntensity)
 * carries soft fill.
 */
export const DEFAULT_LIGHTING = {
  ambient: { color: 0xffffff, intensity: 0.35 },
  directional: {
    color: 0xffffff,
    intensity: 0.45,
    position: [20, 15, 20],
    castShadow: true,
    shadowMapSize: 2048,
  },
  point: { color: 0xffffff, intensity: 0.2, position: [-15, 5, -15] },
  spot: {
    color: 0xffffff,
    intensity: 0.25,
    position: [0, 20, 0],
    angle: 0.4,
    penumbra: 1,
    castShadow: true,
  },
  // Applied as scene.environmentIntensity (the IBL contribution).
  environmentIntensity: 0.3,
}

/**
 * Dimmed direct-light intensities used while showing an environment-map preview
 * (the env map itself provides the illumination, so the rig is pulled down to
 * near-fill). Keyed by light so a caller can set each `.intensity` directly.
 */
export const ENVIRONMENT_PREVIEW_LIGHTING = {
  ambient: 0.06,
  directional: 0.12,
  point: 0.05,
  spot: 0.08,
}

/**
 * Resolve a rig descriptor for a given set of user-facing viewer settings.
 *
 * Semantics (matching the historical viewer sliders):
 *   - ambientIntensity     — absolute ambient light intensity (default = base).
 *   - directionalIntensity — multiplier on the whole directional triplet
 *     (directional/point/spot), default 1 → exactly the base rig.
 *   - environmentIntensity — absolute scene.environmentIntensity (default = base).
 *
 * With no settings (or all undefined) this returns the base rig unchanged, so
 * the viewer's default matches the thumbnail.
 *
 * @param {{ ambientIntensity?: number, directionalIntensity?: number,
 *   environmentIntensity?: number }} [settings]
 * @param {typeof DEFAULT_LIGHTING} [base]
 * @returns {typeof DEFAULT_LIGHTING}
 */
export function resolveSceneLighting(settings = {}, base = DEFAULT_LIGHTING) {
  const directionalScale =
    settings.directionalIntensity != null ? settings.directionalIntensity : 1

  return {
    ambient: {
      ...base.ambient,
      intensity:
        settings.ambientIntensity != null
          ? settings.ambientIntensity
          : base.ambient.intensity,
    },
    directional: {
      ...base.directional,
      intensity: base.directional.intensity * directionalScale,
    },
    point: {
      ...base.point,
      intensity: base.point.intensity * directionalScale,
    },
    spot: {
      ...base.spot,
      intensity: base.spot.intensity * directionalScale,
    },
    environmentIntensity:
      settings.environmentIntensity != null
        ? settings.environmentIntensity
        : base.environmentIntensity,
  }
}

/**
 * Build real THREE light instances from a rig descriptor. Used by the imperative
 * runtimes (worker render template, demo mode). The frontend viewer maps the
 * descriptor to R3F primitives instead, so it does not call this.
 *
 * The lights are returned individually (and as a `lights` array); the caller
 * adds them to its scene. environmentIntensity is descriptor data, not a light,
 * so the caller applies it to `scene.environmentIntensity` separately.
 *
 * @param {object} THREE - The three namespace (or a subset with the four light
 *   constructors and Vector3-style positions).
 * @param {typeof DEFAULT_LIGHTING} [descriptor]
 */
export function buildSceneLights(THREE, descriptor = DEFAULT_LIGHTING) {
  const ambient = new THREE.AmbientLight(
    descriptor.ambient.color,
    descriptor.ambient.intensity
  )

  const directional = new THREE.DirectionalLight(
    descriptor.directional.color,
    descriptor.directional.intensity
  )
  directional.position.set(...descriptor.directional.position)
  if (descriptor.directional.castShadow) {
    directional.castShadow = true
    const size = descriptor.directional.shadowMapSize || 2048
    directional.shadow.mapSize.width = size
    directional.shadow.mapSize.height = size
  }

  const point = new THREE.PointLight(
    descriptor.point.color,
    descriptor.point.intensity
  )
  point.position.set(...descriptor.point.position)

  const spot = new THREE.SpotLight(
    descriptor.spot.color,
    descriptor.spot.intensity
  )
  spot.position.set(...descriptor.spot.position)
  spot.angle = descriptor.spot.angle
  spot.penumbra = descriptor.spot.penumbra
  if (descriptor.spot.castShadow) {
    spot.castShadow = true
  }

  return {
    ambient,
    directional,
    point,
    spot,
    lights: [ambient, directional, point, spot],
  }
}

// Side-effect: expose on window for the Puppeteer scene (parity with the shared
// TIFF decoder / STL builder), in case a page.evaluate classic-script context
// needs it.
if (typeof window !== 'undefined') {
  window.modelibrLighting = {
    DEFAULT_LIGHTING,
    ENVIRONMENT_PREVIEW_LIGHTING,
    resolveSceneLighting,
    buildSceneLights,
  }
}
