/**
 * Shared "apply a Modelibr material without dropping the model's own detail"
 * rule, used identically by the frontend viewer/scenes
 * (`shared/three/mergeMaterialChannels.ts`) and the worker Puppeteer thumbnail
 * (`puppeteerRenderer.js` applyTextures, via the window side-effect below).
 *
 * Building a fresh MeshPhysicalMaterial from only a texture set's channels used
 * to discard every glTF map the set did not cover - and `COLOR_0` vertex
 * colours. The rule here is: a Modelibr material overrides only the channels it
 * actually sets; every other channel keeps the loaded model's original texture
 * and its scalar, and `vertexColors` follows the geometry's `color` attribute
 * (glTF `COLOR_0`) rather than defaulting off.
 *
 * No THREE import: the function only reads/writes material and geometry
 * properties, so the same implementation runs under the bundler and inside the
 * Puppeteer page. Textures are shared by reference and never cloned or disposed
 * - their lifetime belongs to the loader/cache that owns them.
 */

/**
 * Material channels copied from the original when the Modelibr material leaves
 * them unset, each paired with the scalar properties that travel with the map.
 */
const CHANNEL_SCALARS = [
  ['map'],
  ['normalMap', ['normalScale']],
  ['roughnessMap'],
  ['metalnessMap'],
  ['aoMap', ['aoMapIntensity']],
  ['emissiveMap', ['emissive', 'emissiveIntensity']],
  ['alphaMap'],
  ['displacementMap', ['displacementScale', 'displacementBias']],
  ['bumpMap', ['bumpScale']],
]

function firstMaterial(material) {
  if (Array.isArray(material)) return material.find(Boolean) || null
  return material || null
}

function copyScalar(next, source, property) {
  const value = source[property]
  if (value === undefined) return
  // Vectors (normalScale) and colours (emissive) are cloned so editing one
  // material can never reach back into the model's original.
  next[property] =
    value && typeof value.clone === 'function' ? value.clone() : value
}

/**
 * Fill every channel the Modelibr material leaves unset (and the `color`
 * vertex-colour flag) from the loaded model's original material. Mutates and
 * returns `next`; a channel the Modelibr material sets always wins.
 *
 * @param {object|object[]|null|undefined} original - The material(s) already on
 *   the mesh, e.g. the glTF material the loader created.
 * @param {object} next - The Modelibr MeshPhysicalMaterial to complete.
 * @param {{ hasAttribute?: Function }|null} [geometry] - The mesh geometry.
 * @returns {object} `next`, with any missing channels carried over.
 */
export function mergeMaterialChannels(original, next, geometry) {
  const source = firstMaterial(original)
  if (!source || !next) return next

  for (const [channel, scalars] of CHANNEL_SCALARS) {
    // The Modelibr material always wins: only fill a channel it left unset.
    if (next[channel]) continue
    if (!source[channel]) continue
    next[channel] = source[channel]
    if (scalars) {
      for (const scalar of scalars) copyScalar(next, source, scalar)
    }
  }

  // glTF COLOR_0 loads as the `color` attribute. Turn vertex colours on exactly
  // when the geometry carries them, so applying a material neither drops the
  // model's colours nor forces an absent attribute.
  if (geometry && typeof geometry.hasAttribute === 'function') {
    next.vertexColors = geometry.hasAttribute('color')
  }

  return next
}

// Side-effect: expose on window for the Puppeteer page.evaluate (classic-script
// context), parity with the shared texture-material helpers. Lets the worker
// call the same rule without an import.
if (typeof window !== 'undefined') {
  window.modelibrMaterialChannels = { mergeMaterialChannels }
}
