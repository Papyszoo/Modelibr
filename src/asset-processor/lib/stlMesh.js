/**
 * Shared STL → renderable mesh builder, used by both the frontend (ES module
 * import) and the Puppeteer render-template scene (`<script type="module">`,
 * exposes window.modelibrStl as a side-effect).
 *
 * STLLoader resolves to a raw BufferGeometry with no scene graph and no
 * material, and binary STL may carry per-vertex colors (the Materialise/Magics
 * extension, exposed as geometry.hasColors / geometry.alpha). Keeping a single
 * source of truth ensures the in-browser viewer and the server-side thumbnail
 * renderer wrap and shade STL meshes identically.
 */

// Hex form of new Color(0.7, 0.7, 0.9) — the app's neutral default surface.
const NEUTRAL_COLOR = 0xb3b3e6

/**
 * Wrap an STL BufferGeometry in a Group holding a single configured Mesh.
 *
 * THREE is injected (like the TIFF decoder's UTIF) so this runs in both the
 * Vite bundle and the Puppeteer page without pulling in a second three
 * instance. Vertex colors render when present (white base so they aren't
 * tinted); otherwise the neutral surface is used.
 *
 * @param {object} THREE - The three namespace (or a subset with
 *   MeshStandardMaterial, Mesh and Group).
 * @param {object} geometry - BufferGeometry from STLLoader; may set
 *   hasColors / alpha.
 * @param {{ neutralColor?: number }} [options]
 * @returns {object} A THREE.Group wrapping the mesh.
 */
export function buildStlModel(THREE, geometry, options) {
  const hasColors = Boolean(geometry.hasColors)
  const alpha = typeof geometry.alpha === 'number' ? geometry.alpha : 1
  const neutralColor =
    (options && options.neutralColor) != null
      ? options.neutralColor
      : NEUTRAL_COLOR

  const material = new THREE.MeshStandardMaterial({
    color: hasColors ? 0xffffff : neutralColor,
    vertexColors: hasColors,
    opacity: alpha,
    transparent: alpha < 1,
    metalness: 0.3,
    roughness: 0.4,
    envMapIntensity: 1.0,
  })

  const group = new THREE.Group()
  group.add(new THREE.Mesh(geometry, material))
  return group
}

// Side-effect: expose on window for the Puppeteer scene (parity with the shared
// TIFF decoder), in case a page.evaluate classic-script context needs it.
if (typeof globalThis !== 'undefined' && typeof window !== 'undefined') {
  window.modelibrStl = { buildStlModel }
}
