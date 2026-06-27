/**
 * Shared texture-set → material *config* resolver. Single source of truth for
 * the "which maps are present → metalness / roughness / specular gating" rule
 * that the worker thumbnail render (`puppeteerRenderer.js` applyTextures) and
 * the frontend viewer (`TexturedModel.tsx`) must agree on.
 *
 * They drifted once, and it was nasty: the viewer gated metalness on the
 * *base-color* map, so any textured-but-not-metal surface (a base-color map
 * with no metalness map) became fully metallic — a mirror with no diffuse
 * response, lit only by the environment. Under a dim viewer environment it
 * rendered nearly black, while the worker thumbnail (which gates on the
 * metalness map) looked correct. Keeping the rule here stops that recurring.
 *
 * No THREE import here. `resolveTextureMaterialConfig` is pure and returns plain
 * numbers/booleans; the caller constructs the MeshPhysicalMaterial and sets the
 * base color (white when a base-color map is present, else the neutral surface)
 * so three's color management stays caller-side. `ensureAoMapUv2` mutates a
 * geometry through its own methods. These are the incremental, low-risk slices
 * of the texture-set → material pipeline; the channel extraction / displacement
 * orchestration stays per-runtime.
 */

/**
 * @param {{ baseColorMap?: unknown, metalnessMap?: unknown,
 *   roughnessMap?: unknown, specularColorMap?: unknown }} [maps]
 *   Truthy when the corresponding texture is present (a Texture, a URL, etc.).
 * @returns {{ hasBaseColorMap: boolean, metalness: number, roughness: number,
 *   envMapIntensity: number, specularIntensity: number }}
 */
export function resolveTextureMaterialConfig(maps = {}) {
  return {
    // White base color when a base-color map drives the albedo, otherwise the
    // caller falls back to the neutral surface.
    hasBaseColorMap: Boolean(maps.baseColorMap),
    // Metal only with a metalness map; otherwise dielectric so the surface has
    // a normal diffuse response under any lighting.
    metalness: maps.metalnessMap ? 1 : 0,
    // Full roughness lets a roughness map drive the value; without one, a
    // sensible matte default.
    roughness: maps.roughnessMap ? 1 : 0.8,
    envMapIntensity: 1.0,
    // MeshPhysicalMaterial's dielectric specular channel (intensity 1) washes
    // the albedo toward white without a real specular map — disable it unless
    // one is present.
    specularIntensity: maps.specularColorMap ? 1 : 0,
  }
}

/**
 * AO (ambient-occlusion) maps sample the *second* UV set. A geometry that only
 * has `uv` makes the AO term read a missing attribute and collapse toward 0,
 * which silently kills ALL indirect light on the material — both the ambient
 * light and the environment IBL — while leaving direct lights untouched. Symptom
 * in the viewer: the ambient and environment-intensity controls look inert while
 * directional intensity still works.
 *
 * Copy `uv` -> `uv2` (parity with the worker thumbnail) so AO samples correctly.
 * Idempotent, and a no-op when there's no `uv` to copy. Mutates the geometry in
 * place via its own methods — no THREE import needed.
 *
 * @param {{ getAttribute: Function, setAttribute: Function }} geometry
 *   A BufferGeometry (or anything exposing get/setAttribute and a clonable uv).
 */
export function ensureAoMapUv2(geometry) {
  if (!geometry || typeof geometry.getAttribute !== 'function') return
  if (geometry.getAttribute('uv2')) return
  const uvAttr = geometry.getAttribute('uv')
  if (uvAttr && typeof uvAttr.clone === 'function') {
    geometry.setAttribute('uv2', uvAttr.clone())
  }
}

// Side-effect: expose on window for the Puppeteer page.evaluate (classic-script
// context), parity with the shared TIFF decoder / STL builder. Lets the worker
// adopt this without an import once its applyTextures pipeline is migrated.
if (typeof window !== 'undefined') {
  window.modelibrTextureMaterial = {
    resolveTextureMaterialConfig,
    ensureAoMapUv2,
  }
}
